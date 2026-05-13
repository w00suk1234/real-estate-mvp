import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getCurrentUserId } from "./supabaseRepository";
import {
  buildTeamMonthlySummary,
  calculatePayrollTotal,
  canInviteSeat,
  canManageTeam,
  getDefaultTrialDays,
  isTeamSchemaMissingError,
  isSubscriptionActive,
  normalizeTeamModeError,
} from "../utils/teamMode";

const LOCAL_TEAM_KEY = "agentnote_team_mode";
const DEFAULT_PLAN = "team_basic";
const DEFAULT_SEAT_LIMIT = 5;

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function createId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createInviteToken() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String(100000 + (bytes[0] % 900000));
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function hashToken(token) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(String(token || ""));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `dev-${String(token || "")}`;
}

function getLocalUser() {
  try {
    const saved = JSON.parse(localStorage.getItem("auth_user") || "null");
    return saved || {};
  } catch {
    return {};
  }
}

function getLocalUserId() {
  const user = getLocalUser();
  return user.id || user.email || user.username || "local-user";
}

async function getCurrentAuthUser() {
  if (!isSupabaseConfigured || !supabase) return getLocalUser();
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function dedupePendingInvitations(rows = []) {
  const seen = new Set();
  return (rows || []).filter((invite) => {
    const email = normalizeEmail(invite.email);
    const key = email ? `email:${email}` : `invite:${invite.id || invite.token_hash}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readLocalTeamData() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TEAM_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalTeamData(data) {
  localStorage.setItem(LOCAL_TEAM_KEY, JSON.stringify(data));
}

function getLocalData() {
  return {
    teams: [],
    members: [],
    invitations: [],
    subscriptions: [],
    assignments: [],
    transferLogs: [],
    payroll: [],
    ...(readLocalTeamData() || {}),
  };
}

function saveLocalData(data) {
  writeLocalTeamData(data);
  return data;
}

function inviteUrlForToken(token) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://agentnote.co.kr";
  return `${origin}/team?token=${encodeURIComponent(token)}`;
}

function normalizeMember(member = {}, profile = {}) {
  return {
    ...member,
    display_name: profile.manager_name || profile.username || profile.email || member.display_name || member.email || member.user_id,
    email: profile.email || member.email || "",
  };
}

function logTeamModeError(error, context) {
  console.error("[team-mode]", context, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    tableName: error?.tableName,
  });
}

function throwTeamModeError(error, context) {
  const normalizedError = normalizeTeamModeError(error, context);
  logTeamModeError(error, context);
  throw normalizedError;
}

function isMissingAcceptInviteRpc(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "PGRST202" ||
    code === "PGRST204" ||
    (message.includes("schema cache") && message.includes("accept_team_invitation_by_hash")) ||
    message.includes("could not find the function")
  );
}

function isInviteNotFoundError(error) {
  return /만료되었거나 이미 처리|유효하지|not found/i.test(String(error?.message || ""));
}

async function acceptInvitationByRpc(token, tokenHash) {
  if (!isSupabaseConfigured || !supabase) return null;
  const attempts = Array.from(new Set([String(token || ""), String(tokenHash || "")].filter(Boolean)));
  let lastError = null;

  for (const inviteToken of attempts) {
    const { data, error } = await supabase.rpc("accept_team_invitation_by_hash", { invite_token_hash: inviteToken });
    if (!error) return data?.member || data || null;

    lastError = error;
    if (isMissingAcceptInviteRpc(error)) {
      console.warn("[team-mode] accept invitation RPC is not installed yet. Falling back to direct table flow.", {
        message: error.message,
        code: error.code,
      });
      return null;
    }

    if (isInviteNotFoundError(error) && inviteToken !== attempts[attempts.length - 1]) continue;
    throwTeamModeError(error, "accept_team_invitation_by_hash");
  }

  if (lastError) throwTeamModeError(lastError, "accept_team_invitation_by_hash");
  return null;
}

function isTeamInviteCodeColumnMissing(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return (
    code === "PGRST204" ||
    message.includes("invite_code") ||
    message.includes("schema cache")
  );
}

async function fetchProfiles(userIds) {
  if (!isSupabaseConfigured || !supabase || !userIds.length) return {};
  const { data } = await supabase.from("profiles").select("id, username, email, manager_name").in("id", userIds);
  return Object.fromEntries((data || []).map((profile) => [String(profile.id), profile]));
}

async function requireTeamState(teamId) {
  const state = await getCurrentTeamState(teamId);
  if (!state.team || !state.membership) throw new Error("팀 접근 권한이 없습니다.");
  return state;
}

export async function getCurrentTeamState(preferredTeamId = "") {
  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const userId = getLocalUserId();
    const membership = data.members.find(
      (member) => String(member.user_id) === String(userId) && (!preferredTeamId || String(member.team_id) === String(preferredTeamId)),
    );
    const team = membership ? data.teams.find((item) => String(item.id) === String(membership.team_id)) : null;
    const subscription = team ? data.subscriptions.find((item) => String(item.team_id) === String(team.id)) : null;
    return {
      team: team || null,
      membership: membership || null,
      subscription: subscription || null,
      canUse: Boolean(team && isSubscriptionActive(subscription)),
    };
  }

  const userId = await getCurrentUserId();
  if (!userId) return { team: null, membership: null, subscription: null, canUse: false };

  let memberQuery = supabase.from("team_members").select("*").eq("user_id", userId).in("status", ["active", "invited"]);
  if (preferredTeamId) memberQuery = memberQuery.eq("team_id", preferredTeamId);
  const { data: memberRows, error: memberError } = await memberQuery.order("created_at", { ascending: true });
  if (memberError) {
    if (isTeamSchemaMissingError(memberError)) {
      const setupError = normalizeTeamModeError(memberError, "team_members");
      logTeamModeError(memberError, "team_members");
      return {
        team: null,
        membership: null,
        subscription: null,
        canUse: false,
        setupRequired: true,
        setupError,
      };
    }
    throwTeamModeError(memberError, "team_members");
  }

  const membership = memberRows?.[0] || null;
  if (!membership) return { team: null, membership: null, subscription: null, canUse: false };

  const { data: team, error: teamError } = await supabase.from("teams").select("*").eq("id", membership.team_id).maybeSingle();
  if (teamError) throwTeamModeError(teamError, "teams");
  const { data: subscription, error: subscriptionError } = await supabase
    .from("team_subscriptions")
    .select("*")
    .eq("team_id", membership.team_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) throwTeamModeError(subscriptionError, "team_subscriptions");

  return { team, membership, subscription, canUse: Boolean(team && isSubscriptionActive(subscription)) };
}

export async function createTeam({ name }) {
  const teamName = String(name || "").trim();
  if (!teamName) throw new Error("팀 이름을 입력해 주세요.");

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const user = getLocalUser();
    const userId = getLocalUserId();
    const team = {
      id: createId("team"),
      name: teamName,
      owner_user_id: userId,
      plan_type: DEFAULT_PLAN,
      seat_limit: DEFAULT_SEAT_LIMIT,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const member = {
      id: createId("member"),
      team_id: team.id,
      user_id: userId,
      role: "owner",
      status: "active",
      joined_at: nowIso(),
      display_name: user.manager_name || user.username || user.email || "팀장",
      email: user.email || "",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    const subscription = {
      id: createId("subscription"),
      team_id: team.id,
      plan_type: DEFAULT_PLAN,
      status: "trialing",
      seat_limit: DEFAULT_SEAT_LIMIT,
      extra_seat_count: 0,
      is_unlimited: false,
      current_period_start: nowIso(),
      current_period_end: addDays(new Date(), getDefaultTrialDays()).toISOString(),
      provider: null,
      provider_subscription_id: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    saveLocalData({
      ...data,
      teams: [team, ...data.teams],
      members: [member, ...data.members],
      subscriptions: [subscription, ...data.subscriptions],
    });
    return { team, membership: member, subscription };
  }

  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  let createdTeam = null;
  try {
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .insert({
        name: teamName,
        owner_user_id: userId,
        plan_type: DEFAULT_PLAN,
        seat_limit: DEFAULT_SEAT_LIMIT,
        status: "active",
      })
      .select("*")
      .single();
    if (teamError) throw teamError;
    createdTeam = team;

    const { data: membership, error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: team.id,
        user_id: userId,
        role: "owner",
        status: "active",
        joined_at: nowIso(),
      })
      .select("*")
      .single();
    if (memberError) throw memberError;

    const { data: subscription, error: subscriptionError } = await supabase
      .from("team_subscriptions")
      .insert({
        team_id: team.id,
        plan_type: DEFAULT_PLAN,
        status: "trialing",
        seat_limit: DEFAULT_SEAT_LIMIT,
        extra_seat_count: 0,
        is_unlimited: false,
        current_period_start: nowIso(),
        current_period_end: addDays(new Date(), getDefaultTrialDays()).toISOString(),
      })
      .select("*")
      .single();
    if (subscriptionError) throw subscriptionError;

    return { team, membership, subscription };
  } catch (error) {
    if (createdTeam?.id) {
      await supabase.from("teams").delete().eq("id", createdTeam.id);
    }
    throwTeamModeError(error, "team creation");
  }
}

export async function listTeamMembers(teamId) {
  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    return data.members.filter((member) => String(member.team_id) === String(teamId));
  }
  const { data, error } = await supabase.from("team_members").select("*").eq("team_id", teamId).order("created_at", { ascending: true });
  if (error) throwTeamModeError(error, "team_members");
  const profiles = await fetchProfiles((data || []).map((member) => member.user_id).filter(Boolean));
  return (data || []).map((member) => normalizeMember(member, profiles[String(member.user_id)]));
}

export async function listPendingInvitations(teamId) {
  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    return dedupePendingInvitations(
      data.invitations.filter((invite) => String(invite.team_id) === String(teamId) && invite.status === "pending").reverse(),
    );
  }
  const { data, error } = await supabase
    .from("team_invitations")
    .select("*")
    .eq("team_id", teamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throwTeamModeError(error, "team_invitations");
  return dedupePendingInvitations(data || []);
}

export async function revokeTeamInvitation({ teamId, invitationId, email = "" }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("초대 삭제 권한이 없습니다.");
  const normalizedEmail = normalizeEmail(email);

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const invitations = data.invitations.map((invite) => (
      String(invite.team_id) === String(teamId) &&
      invite.status === "pending" &&
      (normalizedEmail ? normalizeEmail(invite.email) === normalizedEmail : String(invite.id) === String(invitationId))
        ? { ...invite, status: "revoked" }
        : invite
    ));
    const teams = data.teams.map((team) => (
      String(team.id) === String(teamId)
        ? { ...team, invite_code: null, invite_code_role: "member", invite_code_email: null, invite_code_expires_at: null, updated_at: nowIso() }
        : team
    ));
    saveLocalData({ ...data, teams, invitations });
    return invitations.find((invite) => String(invite.id) === String(invitationId));
  }

  let query = supabase
    .from("team_invitations")
    .update({ status: "revoked" })
    .eq("team_id", teamId)
    .eq("status", "pending")
    .select("*");
  query = normalizedEmail ? query.ilike("email", normalizedEmail) : query.eq("id", invitationId);
  const { data, error } = await query;
  if (error) throwTeamModeError(error, "team_invitations");
  const { error: clearCodeError } = await supabase
    .from("teams")
    .update({
      invite_code: null,
      invite_code_role: "member",
      invite_code_email: null,
      invite_code_expires_at: null,
      updated_at: nowIso(),
    })
    .eq("id", teamId);
  if (clearCodeError) console.warn("[team-mode] current invite code cleanup failed", clearCodeError);
  return data;
}

export async function clearTeamPendingInvitations(teamId) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("초대 삭제 권한이 없습니다.");

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const invitations = data.invitations.map((invite) => (
      String(invite.team_id) === String(teamId) && invite.status === "pending"
        ? { ...invite, status: "revoked" }
        : invite
    ));
    const teams = data.teams.map((team) => (
      String(team.id) === String(teamId)
        ? { ...team, invite_code: null, invite_code_role: "member", invite_code_email: null, invite_code_expires_at: null, updated_at: nowIso() }
        : team
    ));
    saveLocalData({ ...data, teams, invitations });
    return invitations.filter((invite) => String(invite.team_id) === String(teamId) && invite.status === "revoked");
  }

  const { data, error } = await supabase
    .from("team_invitations")
    .update({ status: "revoked" })
    .eq("team_id", teamId)
    .eq("status", "pending")
    .select("*");
  if (error) throwTeamModeError(error, "team_invitations");
  await supabase
    .from("teams")
    .update({
      invite_code: null,
      invite_code_role: "member",
      invite_code_email: null,
      invite_code_expires_at: null,
      updated_at: nowIso(),
    })
    .eq("id", teamId);
  return data || [];
}

export async function createTeamInvitation({ teamId, email = "", role = "member" }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("초대 권한이 없습니다.");

  const members = await listTeamMembers(teamId);
  // The current MVP uses one active invite code per team. Old pending invite rows
  // are kept only as history, so they should not reserve seats or block a fresh code.
  if (!canInviteSeat({ members, invitations: [], subscription: state.subscription, team: state.team })) {
    throw new Error("좌석 한도를 초과했습니다. 기본 플랜은 팀장 포함 5명까지 사용할 수 있습니다.");
  }

  const token = createInviteToken();
  // Team Mode MVP uses a short numeric invite code. The historical column name
  // is token_hash, but new invitations intentionally store the code directly so
  // users can copy/paste a simple number instead of a long opaque token.
  const tokenHash = token;
  const userId = await getCurrentUserId();
  const expiresAt = addDays(new Date(), 7).toISOString();

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const invitation = {
      id: createId("invite"),
      team_id: teamId,
      email,
      role,
      token_hash: tokenHash,
      status: "pending",
      invited_by: userId,
      expires_at: expiresAt,
      created_at: nowIso(),
    };
    const teams = data.teams.map((team) => (
      String(team.id) === String(teamId)
        ? {
            ...team,
            invite_code: token,
            invite_code_role: role,
            invite_code_email: email || null,
            invite_code_expires_at: expiresAt,
            updated_at: nowIso(),
          }
        : team
    ));
    const invitations = data.invitations.map((invite) => (
      String(invite.team_id) === String(teamId) && invite.status === "pending"
        ? { ...invite, status: "revoked" }
        : invite
    ));
    saveLocalData({ ...data, teams, invitations: [invitation, ...invitations] });
    return { invitation, inviteUrl: inviteUrlForToken(token), token };
  }

  const { error: teamCodeError } = await supabase
    .from("teams")
    .update({
      invite_code: token,
      invite_code_role: role,
      invite_code_email: email || null,
      invite_code_expires_at: expiresAt,
      updated_at: nowIso(),
    })
    .eq("id", teamId);
  if (teamCodeError) {
    if (isTeamInviteCodeColumnMissing(teamCodeError)) {
      throw new Error("초대 코드 DB 설정이 아직 적용되지 않았습니다. Supabase에서 최신 TEAM_MODE_SUPABASE.sql을 다시 실행해 주세요.");
    }
    throwTeamModeError(teamCodeError, "teams");
  }

  const { error: revokeOldInviteError } = await supabase
    .from("team_invitations")
    .update({ status: "revoked" })
    .eq("team_id", teamId)
    .eq("status", "pending");
  if (revokeOldInviteError) {
    console.warn("[team-mode] old pending invite cleanup failed", revokeOldInviteError);
  }

  const { data: invitation, error } = await supabase
    .from("team_invitations")
    .insert({
      team_id: teamId,
      email: email || null,
      role,
      token_hash: tokenHash,
      status: "pending",
      invited_by: userId,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) {
    console.warn("[team-mode] invite history insert failed; team invite code is still usable", error);
    return {
      invitation: {
        id: `team-code-${teamId}`,
        team_id: teamId,
        email: email || null,
        role,
        token_hash: tokenHash,
        status: "pending",
        invited_by: userId,
        expires_at: expiresAt,
        created_at: nowIso(),
      },
      inviteUrl: inviteUrlForToken(token),
      token,
    };
  }
  return { invitation, inviteUrl: inviteUrlForToken(token), token };
}

export async function acceptTeamInvitation(token) {
  const tokenHash = await hashToken(token);
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("로그인이 필요합니다.");

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const user = getLocalUser();
    const invitation = data.invitations.find((invite) => [tokenHash, token].includes(invite.token_hash) && invite.status === "pending");
    if (!invitation) throw new Error("유효하지 않은 초대 코드입니다.");
    if (new Date(invitation.expires_at).getTime() < Date.now()) throw new Error("초대 코드가 만료되었습니다.");
    const invitedEmail = normalizeEmail(invitation.email);
    const userEmail = normalizeEmail(user.email);
    if (invitedEmail && userEmail && invitedEmail !== userEmail) {
      throw new Error(`${invitation.email} 계정으로 로그인한 뒤 초대를 수락해 주세요.`);
    }
    const existingMember = data.members.find((member) => String(member.team_id) === String(invitation.team_id) && String(member.user_id) === String(userId));
    if (existingMember?.status === "active") {
      throw new Error("이미 이 팀에 참여 중입니다. 다른 계정으로 수락하려면 로그아웃 후 초대받은 계정으로 로그인해 주세요.");
    }
    const subscription = data.subscriptions.find((item) => item.team_id === invitation.team_id);
    const members = data.members.filter((member) => member.team_id === invitation.team_id);
    const invitations = data.invitations.filter((invite) => invite.team_id === invitation.team_id && invite.status === "pending" && invite.id !== invitation.id);
    if (!canInviteSeat({ members, invitations, subscription })) throw new Error("좌석 한도를 초과했습니다.");

    const member = {
      id: createId("member"),
      team_id: invitation.team_id,
      user_id: userId,
      role: invitation.role,
      status: "active",
      joined_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    saveLocalData({
      ...data,
      members: [...data.members.filter((item) => !(item.team_id === invitation.team_id && item.user_id === userId)), member],
      invitations: data.invitations.map((item) => {
        const isSameInvite = item.id === invitation.id;
        const isSameEmailInvite = invitedEmail && normalizeEmail(item.email) === invitedEmail && String(item.team_id) === String(invitation.team_id) && item.status === "pending";
        if (!isSameInvite && !isSameEmailInvite) return item;
        return { ...item, status: isSameInvite ? "accepted" : "revoked", accepted_at: isSameInvite ? nowIso() : item.accepted_at, accepted_by: isSameInvite ? userId : item.accepted_by };
      }),
    });
    return member;
  }

  const rpcMember = await acceptInvitationByRpc(token, tokenHash);
  if (rpcMember) return rpcMember;

  const { data: invitation, error } = await supabase
    .from("team_invitations")
    .select("*")
    .or(`token_hash.eq.${tokenHash},token_hash.eq.${token}`)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throwTeamModeError(error, "team_invitations");
  if (!invitation) throw new Error("초대 코드가 만료되었거나 이미 처리되었습니다. 팀장에게 새 초대 코드를 요청해 주세요.");
  if (new Date(invitation.expires_at).getTime() < Date.now()) throw new Error("초대 코드가 만료되었습니다.");

  const currentUser = await getCurrentAuthUser();
  const invitedEmail = normalizeEmail(invitation.email);
  const userEmail = normalizeEmail(currentUser?.email);
  if (invitedEmail && userEmail && invitedEmail !== userEmail) {
    throw new Error(`${invitation.email} 계정으로 로그인한 뒤 초대를 수락해 주세요.`);
  }

  const { data: existingMember, error: existingMemberError } = await supabase
    .from("team_members")
    .select("*")
    .eq("team_id", invitation.team_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingMemberError) throwTeamModeError(existingMemberError, "team_members");
  if (existingMember?.status === "active") {
    throw new Error("이미 이 팀에 참여 중입니다. 다른 계정으로 수락하려면 로그아웃 후 초대받은 계정으로 로그인해 주세요.");
  }

  const members = await listTeamMembers(invitation.team_id);
  const invitations = (await listPendingInvitations(invitation.team_id)).filter((item) => item.id !== invitation.id);
  const [{ data: inviteTeam }, { data: inviteSubscription }] = await Promise.all([
    supabase.from("teams").select("*").eq("id", invitation.team_id).maybeSingle(),
    supabase
      .from("team_subscriptions")
      .select("*")
      .eq("team_id", invitation.team_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!canInviteSeat({ members, invitations, subscription: inviteSubscription, team: inviteTeam })) {
    throw new Error("좌석 한도를 초과했습니다.");
  }

  const { data: member, error: memberError } = await supabase
    .from("team_members")
    .upsert({
      team_id: invitation.team_id,
      user_id: userId,
      role: invitation.role,
      status: "active",
      invited_by: invitation.invited_by,
      joined_at: nowIso(),
    }, { onConflict: "team_id,user_id" })
    .select("*")
    .single();
  if (memberError) throwTeamModeError(memberError, "team_members");

  const { error: acceptError } = await supabase
    .from("team_invitations")
    .update({ status: "accepted", accepted_at: nowIso(), accepted_by: userId })
    .eq("id", invitation.id);
  if (acceptError) {
    console.warn("[team-mode] invitation accepted but status update failed", acceptError);
  }

  if (invitedEmail) {
    const { error: revokeDuplicateError } = await supabase
      .from("team_invitations")
      .update({ status: "revoked" })
      .eq("team_id", invitation.team_id)
      .eq("status", "pending")
      .ilike("email", invitedEmail);
    if (revokeDuplicateError) {
      console.warn("[team-mode] duplicate invitation cleanup failed", revokeDuplicateError);
    }
  }

  return member;
}

export async function updateTeamMember({ teamId, memberId, role, status }) {
  const state = await requireTeamState(teamId);
  if (state.membership.role !== "owner") throw new Error("팀장만 역할을 변경할 수 있습니다.");
  if (String(state.membership.id) === String(memberId) && status !== "active") throw new Error("본인 계정은 비활성화할 수 없습니다.");

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const nextMembers = data.members.map((member) => member.id === memberId ? { ...member, role: role || member.role, status: status || member.status, updated_at: nowIso() } : member);
    saveLocalData({ ...data, members: nextMembers });
    return nextMembers.find((member) => member.id === memberId);
  }

  const { data, error } = await supabase
    .from("team_members")
    .update({ role, status, updated_at: nowIso() })
    .eq("id", memberId)
    .eq("team_id", teamId)
    .select("*")
    .single();
  if (error) throwTeamModeError(error, "team_members");
  return data;
}

export async function listTeamCustomers(teamId, filters = {}) {
  const state = await requireTeamState(teamId);
  const isManager = canManageTeam(state.membership);
  const userId = await getCurrentUserId();

  if (!isSupabaseConfigured || !supabase) {
    const rows = JSON.parse(localStorage.getItem(`real_estate_mvp_customers:${getLocalUserId()}`) || "[]");
    return rows.filter((customer) => String(customer.team_id) === String(teamId) && (isManager || String(customer.assigned_to_user_id) === String(userId)));
  }

  let query = supabase.from("customers").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
  if (!isManager) query = query.eq("assigned_to_user_id", userId);
  if (filters.assignedTo) query = query.eq("assigned_to_user_id", filters.assignedTo);
  if (filters.month) query = query.gte("inflow_date", `${filters.month}-01`).lt("inflow_date", nextMonthValue(filters.month));
  const { data, error } = await query;
  if (error) throwTeamModeError(error, "customers");
  return data || [];
}

export async function listPersonalAssignableCustomers(teamId) {
  const userId = await getCurrentUserId();
  if (!isSupabaseConfigured || !supabase) {
    const rows = JSON.parse(localStorage.getItem(`real_estate_mvp_customers:${getLocalUserId()}`) || "[]");
    return rows.filter((customer) => !customer.team_id || String(customer.team_id) === String(teamId));
  }
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", userId)
    .or(`team_id.is.null,team_id.eq.${teamId}`)
    .order("created_at", { ascending: false });
  if (error) throwTeamModeError(error, "customers");
  return data || [];
}

function nextMonthValue(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const date = new Date(year, (monthNumber || 1), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function assignCustomer({ teamId, customerId, assignedToUserId, memo = "" }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("고객 배정 권한이 없습니다.");
  const userId = await getCurrentUserId();

  if (!isSupabaseConfigured || !supabase) {
    const key = `real_estate_mvp_customers:${getLocalUserId()}`;
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    const nextRows = rows.map((customer) => String(customer.id) === String(customerId) ? { ...customer, team_id: teamId, assigned_to_user_id: assignedToUserId, created_by_user_id: customer.created_by_user_id || userId } : customer);
    localStorage.setItem(key, JSON.stringify(nextRows));
    return nextRows.find((customer) => String(customer.id) === String(customerId));
  }

  const patch = {
    team_id: teamId,
    assigned_to_user_id: assignedToUserId,
    created_by_user_id: userId,
  };
  const { data, error } = await supabase.from("customers").update(patch).eq("id", customerId).select("*").single();
  if (error) throwTeamModeError(error, "customers");
  await supabase.from("schedules").update(patch).or(`customer_id.eq.${customerId},linked_customer_id.eq.${customerId}`);
  await supabase.from("settlements").update(patch).eq("customer_id", customerId);
  await supabase.from("customer_assignments").insert({
    team_id: teamId,
    customer_id: customerId,
    assigned_to_user_id: assignedToUserId,
    assigned_by_user_id: userId,
    memo,
  });
  return data;
}

export async function transferCustomer({ teamId, customerId, toUserId, reason = "" }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("고객 이관 권한이 없습니다.");
  const userId = await getCurrentUserId();

  if (!isSupabaseConfigured || !supabase) {
    return assignCustomer({ teamId, customerId, assignedToUserId: toUserId, memo: reason });
  }

  const { data: existing, error: readError } = await supabase.from("customers").select("*").eq("id", customerId).eq("team_id", teamId).single();
  if (readError) throwTeamModeError(readError, "customers");
  const patch = { assigned_to_user_id: toUserId };
  const { data, error } = await supabase.from("customers").update(patch).eq("id", customerId).eq("team_id", teamId).select("*").single();
  if (error) throwTeamModeError(error, "customers");
  await supabase.from("schedules").update(patch).eq("team_id", teamId).or(`customer_id.eq.${customerId},linked_customer_id.eq.${customerId}`);
  await supabase.from("settlements").update(patch).eq("team_id", teamId).eq("customer_id", customerId);
  await supabase.from("customer_transfer_logs").insert({
    team_id: teamId,
    customer_id: customerId,
    from_user_id: existing.assigned_to_user_id || null,
    to_user_id: toUserId,
    transferred_by_user_id: userId,
    reason,
  });
  return data;
}

export async function bulkTransferCustomers({ teamId, fromUserId, toUserId, reason = "" }) {
  const customers = await listTeamCustomers(teamId, { assignedTo: fromUserId });
  const results = [];
  for (const customer of customers) {
    results.push(await transferCustomer({ teamId, customerId: customer.id, toUserId, reason }));
  }
  return results;
}

export async function listTeamSchedules(teamId, filters = {}) {
  const state = await requireTeamState(teamId);
  const isManager = canManageTeam(state.membership);
  const userId = await getCurrentUserId();

  if (!isSupabaseConfigured || !supabase) return [];

  let query = supabase.from("schedules").select("*").eq("team_id", teamId).order("schedule_date", { ascending: true });
  if (!isManager) query = query.eq("assigned_to_user_id", userId);
  if (filters.assignedTo) query = query.eq("assigned_to_user_id", filters.assignedTo);
  if (filters.month) query = query.gte("schedule_date", `${filters.month}-01`).lt("schedule_date", nextMonthValue(filters.month));
  const { data, error } = await query;
  if (error) throwTeamModeError(error, "schedules");
  return data || [];
}

export async function listTeamSettlements(teamId, filters = {}) {
  const state = await requireTeamState(teamId);
  const isManager = canManageTeam(state.membership);
  const userId = await getCurrentUserId();

  if (!isSupabaseConfigured || !supabase) return [];

  let query = supabase.from("settlements").select("*").eq("team_id", teamId).order("balance_date", { ascending: false });
  if (!isManager) query = query.eq("assigned_to_user_id", userId);
  if (filters.month) query = query.gte("balance_date", `${filters.month}-01`).lt("balance_date", nextMonthValue(filters.month));
  const { data, error } = await query;
  if (error) throwTeamModeError(error, "settlements");
  return data || [];
}

export async function getTeamMonthlySummary(teamId, month) {
  const [state, members, customers, schedules, settlements] = await Promise.all([
    requireTeamState(teamId),
    listTeamMembers(teamId),
    listTeamCustomers(teamId),
    listTeamSchedules(teamId, { month }),
    listTeamSettlements(teamId, { month }),
  ]);
  if (!canViewTeamDataGuard(state.membership)) throw new Error("팀 조회 권한이 없습니다.");
  return buildTeamMonthlySummary({ month, members, customers, schedules, settlements });
}

function canViewTeamDataGuard(membership) {
  return ["owner", "admin", "member", "viewer"].includes(String(membership?.role || "")) && membership?.status !== "suspended";
}

export async function listPayrollStatements(teamId, month) {
  const state = await requireTeamState(teamId);
  const userId = await getCurrentUserId();
  const isManager = canManageTeam(state.membership);

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    return data.payroll.filter((item) => item.team_id === teamId && (!month || item.month === month) && (isManager || item.user_id === userId));
  }

  let query = supabase.from("payroll_statements").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
  if (month) query = query.eq("month", month);
  if (!isManager) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throwTeamModeError(error, "payroll_statements");
  return data || [];
}

export async function createPayrollStatement({ teamId, userId, month, basePay, commissionPay, bonusPay, deductionAmount, memo }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("급여명세서 작성 권한이 없습니다.");
  const currentUserId = await getCurrentUserId();
  const payload = {
    team_id: teamId,
    user_id: userId,
    month,
    title: `${month} 급여명세서`,
    base_pay: Number(basePay || 0),
    commission_pay: Number(commissionPay || 0),
    bonus_pay: Number(bonusPay || 0),
    deduction_amount: Number(deductionAmount || 0),
    total_pay: calculatePayrollTotal({ base_pay: basePay, commission_pay: commissionPay, bonus_pay: bonusPay, deduction_amount: deductionAmount }),
    memo: memo || "",
    status: "draft",
    created_by: currentUserId,
  };

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const item = { id: createId("payroll"), ...payload, created_at: nowIso(), updated_at: nowIso() };
    saveLocalData({ ...data, payroll: [item, ...data.payroll] });
    return item;
  }

  const { data, error } = await supabase.from("payroll_statements").insert(payload).select("*").single();
  if (error) throwTeamModeError(error, "payroll_statements");
  return data;
}

export async function deliverPayrollStatement({ teamId, payrollId }) {
  const state = await requireTeamState(teamId);
  if (!canManageTeam(state.membership)) throw new Error("급여명세서 전달 권한이 없습니다.");

  if (!isSupabaseConfigured || !supabase) {
    const data = getLocalData();
    const payroll = data.payroll.map((item) => item.id === payrollId ? { ...item, status: "delivered", delivered_at: nowIso(), updated_at: nowIso() } : item);
    saveLocalData({ ...data, payroll });
    return payroll.find((item) => item.id === payrollId);
  }

  const { data, error } = await supabase
    .from("payroll_statements")
    .update({ status: "delivered", delivered_at: nowIso(), updated_at: nowIso() })
    .eq("id", payrollId)
    .eq("team_id", teamId)
    .select("*")
    .single();
  if (error) throwTeamModeError(error, "payroll_statements");
  return data;
}
