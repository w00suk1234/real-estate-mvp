import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  acceptTeamInvitation,
  assignCustomer,
  bulkTransferCustomers,
  createPayrollStatement,
  createTeam,
  createTeamInvitation,
  deliverPayrollStatement,
  getCurrentTeamState,
  getTeamMonthlySummary,
  listPayrollStatements,
  listPendingInvitations,
  listPersonalAssignableCustomers,
  listTeamCustomers,
  listTeamMembers,
  listTeamSchedules,
  listTeamSettlements,
  transferCustomer,
  updateTeamMember,
} from "../services/teamModeService";
import {
  TEAM_MODE_SETUP_MESSAGE,
  TEAM_SCHEDULE_TYPES,
  buildScheduleTypeCounts,
  calculatePayrollTotal,
  canManageTeam,
  getTeamModeErrorMessage,
  getSeatCapacity,
  getSeatUsage,
  isTeamModeSetupError,
  isTeamModeEnabled,
  isTeamSelfCreateAllowed,
} from "../utils/teamMode";

const TABS = [
  ["dashboard", "팀 대시보드"],
  ["members", "팀원 관리"],
  ["customers", "팀 고객관리"],
  ["schedules", "팀 일정관리"],
  ["settlements", "팀 정산"],
  ["payroll", "급여명세서"],
];

const today = new Date();

function toMonthInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatWon(value) {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(Number(value || 0)))}원`;
}

function memberLabel(member) {
  return member.display_name || member.name || member.email || member.user_id || "팀원";
}

function getCustomerName(customer) {
  return customer.name || customer.customer_name || "이름 없음";
}

function TeamModePage() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [month, setMonth] = useState(toMonthInputValue(today));
  const [state, setState] = useState({ team: null, membership: null, subscription: null, canUse: false });
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [personalCustomers, setPersonalCustomers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [payroll, setPayroll] = useState([]);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLink, setInviteLink] = useState("");
  const [acceptToken, setAcceptToken] = useState("");
  const [assignForm, setAssignForm] = useState({ customerId: "", assignedToUserId: "", memo: "" });
  const [transferForm, setTransferForm] = useState({ customerId: "", toUserId: "", reason: "" });
  const [bulkForm, setBulkForm] = useState({ fromUserId: "", toUserId: "", reason: "퇴사자 고객 인수인계" });
  const [payrollForm, setPayrollForm] = useState({ userId: "", basePay: "", commissionPay: "", bonusPay: "", deductionAmount: "", memo: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  const isManager = canManageTeam(state.membership);
  const seatCapacity = getSeatCapacity(state.subscription, state.team);
  const seatUsage = getSeatUsage({ members, invitations });
  const scheduleCounts = useMemo(() => buildScheduleTypeCounts(schedules), [schedules]);

  function showSuccess(text) {
    setMessageType("success");
    setMessage(text);
  }

  function showError(error, fallback) {
    console.error("[TeamModePage]", fallback, {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      tableName: error?.tableName,
    });
    setMessageType(isTeamModeSetupError(error) ? "warning" : "error");
    setMessage(getTeamModeErrorMessage(error, fallback));
  }

  async function loadTeam() {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const currentState = await getCurrentTeamState();
      setState(currentState);
      if (currentState.setupRequired) {
        setMembers([]);
        setInvitations([]);
        setMessageType("warning");
        setMessage(currentState.setupError?.message || TEAM_MODE_SETUP_MESSAGE);
        return;
      }
      if (!currentState.team) return;
      const [memberRows, inviteRows] = await Promise.all([
        listTeamMembers(currentState.team.id),
        listPendingInvitations(currentState.team.id),
      ]);
      setMembers(memberRows);
      setInvitations(inviteRows);
      await loadTeamData(currentState.team.id);
    } catch (error) {
      showError(error, "팀 정보를 불러오지 못했습니다. Supabase 팀플모드 SQL 적용 여부를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamData(teamId = state.team?.id) {
    if (!teamId) return;
    const [teamCustomers, assignableCustomers, teamSchedules, teamSettlements, monthlySummary, payrollRows] = await Promise.all([
      listTeamCustomers(teamId),
      listPersonalAssignableCustomers(teamId).catch(() => []),
      listTeamSchedules(teamId, { month }),
      listTeamSettlements(teamId, { month }),
      getTeamMonthlySummary(teamId, month),
      listPayrollStatements(teamId, month),
    ]);
    setCustomers(teamCustomers);
    setPersonalCustomers(assignableCustomers);
    setSchedules(teamSchedules);
    setSettlements(teamSettlements);
    setSummary(monthlySummary);
    setPayroll(payrollRows);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) setAcceptToken(token);
  }, []);

  useEffect(() => {
    loadTeam();
  }, [authLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    if (state.team?.id) {
      loadTeamData(state.team.id).catch((error) => showError(error, "팀 데이터를 불러오지 못했습니다."));
    }
  }, [month]);

  async function handleCreateTeam(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const result = await createTeam({ name: teamName });
      setState({ ...result, canUse: true });
      setTeamName("");
      showSuccess("팀이 생성되었습니다. 팀원 초대 링크를 생성할 수 있습니다.");
      await loadTeam();
    } catch (error) {
      showError(error, "팀 생성에 실패했습니다. 설정을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAcceptInvitation(event) {
    event.preventDefault();
    if (!acceptToken.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await acceptTeamInvitation(acceptToken.trim());
      setAcceptToken("");
      showSuccess("초대를 수락했습니다.");
      await loadTeam();
    } catch (error) {
      showError(error, "초대 수락에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateInvitation(event) {
    event.preventDefault();
    if (!state.team?.id) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await createTeamInvitation({ teamId: state.team.id, email: inviteEmail, role: inviteRole });
      setInviteLink(result.inviteUrl);
      setInviteEmail("");
      showSuccess("초대 링크를 생성했습니다. 링크를 복사해 팀원에게 전달하세요.");
      setInvitations(await listPendingInvitations(state.team.id));
    } catch (error) {
      showError(error, "초대 링크 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleMemberChange(member, patch) {
    if (!state.team?.id) return;
    setSaving(true);
    try {
      await updateTeamMember({ teamId: state.team.id, memberId: member.id, ...patch });
      setMembers(await listTeamMembers(state.team.id));
      showSuccess("팀원 정보를 변경했습니다.");
    } catch (error) {
      showError(error, "팀원 정보를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssignCustomer(event) {
    event.preventDefault();
    if (!state.team?.id || !assignForm.customerId || !assignForm.assignedToUserId) return;
    setSaving(true);
    try {
      await assignCustomer({ teamId: state.team.id, ...assignForm });
      setAssignForm({ customerId: "", assignedToUserId: "", memo: "" });
      showSuccess("고객을 팀원에게 배정했습니다.");
      await loadTeamData();
    } catch (error) {
      showError(error, "고객 배정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTransferCustomer(event) {
    event.preventDefault();
    if (!state.team?.id || !transferForm.customerId || !transferForm.toUserId) return;
    if (!window.confirm("고객 담당자를 이관할까요?")) return;
    setSaving(true);
    try {
      await transferCustomer({ teamId: state.team.id, ...transferForm });
      setTransferForm({ customerId: "", toUserId: "", reason: "" });
      showSuccess("고객을 이관했습니다.");
      await loadTeamData();
    } catch (error) {
      showError(error, "고객 이관에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkTransfer(event) {
    event.preventDefault();
    if (!state.team?.id || !bulkForm.fromUserId || !bulkForm.toUserId) return;
    if (!window.confirm("선택한 팀원의 배정 고객을 일괄 이관할까요?")) return;
    setSaving(true);
    try {
      const results = await bulkTransferCustomers({ teamId: state.team.id, ...bulkForm });
      showSuccess(`${results.length}명의 고객을 일괄 이관했습니다.`);
      await loadTeamData();
    } catch (error) {
      showError(error, "일괄 이관에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePayroll(event) {
    event.preventDefault();
    if (!state.team?.id || !payrollForm.userId) return;
    setSaving(true);
    try {
      await createPayrollStatement({ teamId: state.team.id, userId: payrollForm.userId, month, ...payrollForm });
      setPayrollForm({ userId: "", basePay: "", commissionPay: "", bonusPay: "", deductionAmount: "", memo: "" });
      showSuccess("급여명세서 초안을 저장했습니다.");
      setPayroll(await listPayrollStatements(state.team.id, month));
    } catch (error) {
      showError(error, "급여명세서를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeliverPayroll(payrollId) {
    if (!state.team?.id) return;
    setSaving(true);
    try {
      await deliverPayrollStatement({ teamId: state.team.id, payrollId });
      showSuccess("급여명세서를 전달 완료로 표시했습니다.");
      setPayroll(await listPayrollStatements(state.team.id, month));
    } catch (error) {
      showError(error, "전달 완료 처리에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (!isTeamModeEnabled()) {
    return (
      <div className="page-stack team-mode-page">
        <section className="page-header-card compact-page-header">
          <div>
            <h1>팀플모드</h1>
            <p>현재 환경에서는 팀플모드가 비활성화되어 있습니다.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loading) {
    return <div className="page-stack team-mode-page"><div className="recommend-empty-state">팀 정보를 불러오는 중입니다.</div></div>;
  }

  if (!state.team) {
    return (
      <div className="page-stack team-mode-page">
        <section className="page-header-card compact-page-header">
          <div>
            <h1>팀플모드</h1>
            <p>대표/팀장이 팀원의 고객관리, 일정관리, 정산 현황을 함께 확인하는 유료 기능입니다.</p>
          </div>
        </section>
        {message ? <div className={`schedule-inline-alert team-mode-alert ${messageType}`}>{message}</div> : null}
        {messageType === "warning" ? (
          <section className="team-mode-setup-guide">
            <strong>관리자 설정 필요</strong>
            <span>Supabase SQL Editor에서 docs/TEAM_MODE_SUPABASE.sql을 실행한 뒤, Vercel 환경변수의 Supabase URL이 같은 프로젝트인지 확인해 주세요.</span>
          </section>
        ) : null}
        <section className="team-onboarding-grid">
          <form className="dashboard-card team-onboarding-card" onSubmit={handleCreateTeam}>
            <h2>팀 만들기</h2>
            <p>기본 플랜은 팀장 포함 5명까지 사용할 수 있습니다. 실제 결제 연동 전에는 trialing 상태로 시작합니다.</p>
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="예: 한서 부동산 팀" disabled={!isTeamSelfCreateAllowed()} />
            <button type="submit" className="primary-btn" disabled={saving || !isTeamSelfCreateAllowed()}>
              팀 만들기
            </button>
            {!isTeamSelfCreateAllowed() ? <small>팀 생성은 관리자에게 문의해 주세요.</small> : null}
          </form>
          <form className="dashboard-card team-onboarding-card" onSubmit={handleAcceptInvitation}>
            <h2>초대 링크로 참여</h2>
            <p>팀장이 전달한 초대 링크의 token 값을 붙여 넣으면 팀에 참여할 수 있습니다.</p>
            <input value={acceptToken} onChange={(event) => setAcceptToken(event.target.value)} placeholder="초대 token" />
            <button type="submit" className="secondary-btn" disabled={saving || !acceptToken.trim()}>
              초대 수락
            </button>
          </form>
        </section>
      </div>
    );
  }

  const totalPayrollPreview = calculatePayrollTotal({
    base_pay: payrollForm.basePay,
    commission_pay: payrollForm.commissionPay,
    bonus_pay: payrollForm.bonusPay,
    deduction_amount: payrollForm.deductionAmount,
  });

  return (
    <div className="page-stack team-mode-page">
      <section className="page-header-card compact-page-header team-mode-header">
        <div>
          <h1>팀플모드</h1>
          <p>{state.team.name} · {state.membership.role} · {state.subscription?.status || "구독 상태 없음"}</p>
        </div>
        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
      </section>

      {message ? <div className={`schedule-inline-alert team-mode-alert ${messageType}`}>{message}</div> : null}

      {!state.canUse ? (
        <section className="dashboard-card team-mode-locked">
          <h2>팀플모드가 제한되었습니다.</h2>
          <p>팀 구독 상태가 active 또는 trialing일 때 사용할 수 있습니다. 관리자/개발자가 team_subscriptions.status를 확인해야 합니다.</p>
        </section>
      ) : null}

      <section className="team-mode-tabs" role="tablist" aria-label="팀플모드 메뉴">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </section>

      {activeTab === "dashboard" ? (
        <section className="team-mode-panel">
          <div className="team-stat-grid">
            <StatCard label="이번 달 손님 인입" value={`${summary?.customerInflowCount || 0}명`} />
            <StatCard label="이번 달 계약 고객" value={`${summary?.contractCustomerCount || 0}명`} />
            <StatCard label="이번 달 정산 금액" value={formatWon(summary?.settlementAmount || 0)} />
            <StatCard label="팀 좌석" value={`${seatUsage} / ${seatCapacity === Infinity ? "무제한" : seatCapacity}명`} />
          </div>
          <MemberSummaryTable summaries={summary?.memberSummaries || []} />
        </section>
      ) : null}

      {activeTab === "members" ? (
        <section className="team-mode-panel team-two-column">
          <div className="dashboard-card">
            <div className="section-heading-row">
              <div>
                <h2>팀원 관리</h2>
                <p>사용 중 {seatUsage} / {seatCapacity === Infinity ? "무제한" : seatCapacity}명</p>
              </div>
            </div>
            <div className="team-member-list">
              {members.map((member) => (
                <article key={member.id} className="team-member-row">
                  <div>
                    <strong>{memberLabel(member)}</strong>
                    <span>{member.email || member.user_id}</span>
                  </div>
                  <select value={member.role} disabled={!isManager || state.membership.role !== "owner" || saving} onChange={(event) => handleMemberChange(member, { role: event.target.value, status: member.status })}>
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button type="button" className="danger-btn small-btn" disabled={!isManager || member.role === "owner"} onClick={() => handleMemberChange(member, { role: member.role, status: "suspended" })}>
                    비활성화
                  </button>
                </article>
              ))}
            </div>
          </div>
          {isManager ? (
            <form className="dashboard-card" onSubmit={handleCreateInvitation}>
              <h2>초대 링크 생성</h2>
              <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="이메일 선택 입력" />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                <option value="member">member</option>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
              <button type="submit" className="primary-btn" disabled={saving}>초대 링크 생성</button>
              {inviteLink ? (
                <div className="team-invite-link">
                  <span>{inviteLink}</span>
                  <button type="button" className="secondary-btn small-btn" onClick={() => navigator.clipboard?.writeText(inviteLink)}>복사</button>
                </div>
              ) : null}
              <p>기본 플랜은 팀장 포함 5명까지 사용할 수 있습니다. 추가 인원 플랜은 준비 중입니다.</p>
            </form>
          ) : null}
        </section>
      ) : null}

      {activeTab === "customers" ? (
        <section className="team-mode-panel">
          {isManager ? (
            <div className="team-action-grid">
              <form className="dashboard-card" onSubmit={handleAssignCustomer}>
                <h2>고객 배정</h2>
                <select value={assignForm.customerId} onChange={(event) => setAssignForm((prev) => ({ ...prev, customerId: event.target.value }))}>
                  <option value="">팀에 공유할 고객 선택</option>
                  {personalCustomers.map((customer) => <option key={customer.id} value={customer.id}>{getCustomerName(customer)}</option>)}
                </select>
                <MemberSelect members={members} value={assignForm.assignedToUserId} onChange={(value) => setAssignForm((prev) => ({ ...prev, assignedToUserId: value }))} />
                <input value={assignForm.memo} onChange={(event) => setAssignForm((prev) => ({ ...prev, memo: event.target.value }))} placeholder="배정 메모" />
                <button type="submit" className="primary-btn" disabled={saving}>배정하기</button>
              </form>
              <form className="dashboard-card" onSubmit={handleTransferCustomer}>
                <h2>고객 이관</h2>
                <select value={transferForm.customerId} onChange={(event) => setTransferForm((prev) => ({ ...prev, customerId: event.target.value }))}>
                  <option value="">이관할 팀 고객 선택</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{getCustomerName(customer)}</option>)}
                </select>
                <MemberSelect members={members} value={transferForm.toUserId} onChange={(value) => setTransferForm((prev) => ({ ...prev, toUserId: value }))} />
                <input value={transferForm.reason} onChange={(event) => setTransferForm((prev) => ({ ...prev, reason: event.target.value }))} placeholder="이관 사유" />
                <button type="submit" className="secondary-btn" disabled={saving}>이관하기</button>
              </form>
              <form className="dashboard-card" onSubmit={handleBulkTransfer}>
                <h2>퇴사자 일괄 이관</h2>
                <MemberSelect members={members} value={bulkForm.fromUserId} onChange={(value) => setBulkForm((prev) => ({ ...prev, fromUserId: value }))} placeholder="기존 담당자" />
                <MemberSelect members={members} value={bulkForm.toUserId} onChange={(value) => setBulkForm((prev) => ({ ...prev, toUserId: value }))} placeholder="새 담당자" />
                <input value={bulkForm.reason} onChange={(event) => setBulkForm((prev) => ({ ...prev, reason: event.target.value }))} />
                <button type="submit" className="danger-btn" disabled={saving}>일괄 이관</button>
              </form>
            </div>
          ) : null}
          <div className="dashboard-card">
            <h2>{isManager ? "팀 전체 고객" : "내 배정 고객"}</h2>
            <div className="team-table-wrap">
              <table className="team-table">
                <thead><tr><th>고객</th><th>담당자</th><th>상태</th><th>유입일</th><th>메모</th></tr></thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{getCustomerName(customer)}</td>
                      <td>{memberLabel(members.find((member) => String(member.user_id) === String(customer.assigned_to_user_id)) || {})}</td>
                      <td>{customer.contract_status || "미계약"}</td>
                      <td>{customer.inflow_date || customer.created_at?.slice(0, 10) || "-"}</td>
                      <td>{customer.memo || customer.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "schedules" ? (
        <section className="team-mode-panel">
          <div className="team-stat-grid compact">
            {TEAM_SCHEDULE_TYPES.map((item) => <StatCard key={item.key} label={item.label} value={`${scheduleCounts[item.key] || 0}건`} />)}
          </div>
          <TeamSimpleTable title={isManager ? "팀 전체 일정" : "내 일정"} rows={schedules} columns={[
            ["schedule_date", "날짜"],
            ["schedule_type", "종류"],
            ["title", "일정"],
            ["customer_name", "고객"],
          ]} />
        </section>
      ) : null}

      {activeTab === "settlements" ? (
        <section className="team-mode-panel">
          <div className="team-stat-grid">
            <StatCard label="손님 인입" value={`${summary?.customerInflowCount || 0}명`} />
            <StatCard label="계약 고객" value={`${summary?.contractCustomerCount || 0}명`} />
            <StatCard label="정산 금액" value={formatWon(summary?.settlementAmount || 0)} />
            <StatCard label="정산 건수" value={`${summary?.settlementCount || 0}건`} />
          </div>
          <MemberSummaryTable summaries={summary?.memberSummaries || []} />
          <TeamSimpleTable title="정산 목록" rows={settlements} columns={[
            ["balance_date", "정산일"],
            ["customer_name", "고객"],
            ["status", "상태"],
            [(row) => formatWon((Number(row.tenant_fee || 0) + Number(row.landlord_fee || 0)) || row.total_fee || row.commission_amount), "금액"],
          ]} />
        </section>
      ) : null}

      {activeTab === "payroll" ? (
        <section className="team-mode-panel team-two-column">
          {isManager ? (
            <form className="dashboard-card" onSubmit={handleCreatePayroll}>
              <h2>급여명세서 초안</h2>
              <MemberSelect members={members} value={payrollForm.userId} onChange={(value) => setPayrollForm((prev) => ({ ...prev, userId: value }))} />
              <input inputMode="numeric" value={payrollForm.basePay} onChange={(event) => setPayrollForm((prev) => ({ ...prev, basePay: event.target.value }))} placeholder="기본급" />
              <input inputMode="numeric" value={payrollForm.commissionPay} onChange={(event) => setPayrollForm((prev) => ({ ...prev, commissionPay: event.target.value }))} placeholder="수수료" />
              <input inputMode="numeric" value={payrollForm.bonusPay} onChange={(event) => setPayrollForm((prev) => ({ ...prev, bonusPay: event.target.value }))} placeholder="보너스" />
              <input inputMode="numeric" value={payrollForm.deductionAmount} onChange={(event) => setPayrollForm((prev) => ({ ...prev, deductionAmount: event.target.value }))} placeholder="공제액" />
              <textarea rows="3" value={payrollForm.memo} onChange={(event) => setPayrollForm((prev) => ({ ...prev, memo: event.target.value }))} placeholder="메모" />
              <div className="settlement-total-box"><span>총 지급액</span><strong>{formatWon(totalPayrollPreview)}</strong></div>
              <button type="submit" className="primary-btn" disabled={saving}>초안 저장</button>
              <small>급여명세서는 내부 정산 참고용입니다. 실제 지급/세무 처리는 별도 확인이 필요합니다.</small>
            </form>
          ) : null}
          <div className="dashboard-card">
            <h2>{isManager ? "급여명세서 목록" : "내 급여명세서"}</h2>
            <div className="team-payroll-list">
              {payroll.map((item) => (
                <article key={item.id} className="team-payroll-card">
                  <div><strong>{item.title || `${item.month} 급여명세서`}</strong><span>{memberLabel(members.find((member) => String(member.user_id) === String(item.user_id)) || {})}</span></div>
                  <strong>{formatWon(item.total_pay)}</strong>
                  <span>{item.status}</span>
                  {isManager && item.status !== "delivered" ? (
                    <button type="button" className="secondary-btn small-btn" onClick={() => handleDeliverPayroll(item.id)}>전달 완료</button>
                  ) : null}
                </article>
              ))}
              {!payroll.length ? <div className="empty-state">급여명세서가 없습니다.</div> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }) {
  return <article className="team-stat-card"><span>{label}</span><strong>{value}</strong></article>;
}

function MemberSelect({ members, value, onChange, placeholder = "팀원 선택" }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {members.filter((member) => member.status !== "suspended").map((member) => (
        <option key={member.id} value={member.user_id}>{memberLabel(member)}</option>
      ))}
    </select>
  );
}

function MemberSummaryTable({ summaries }) {
  return (
    <div className="dashboard-card">
      <h2>팀원별 현황</h2>
      <div className="team-table-wrap">
        <table className="team-table">
          <thead><tr><th>팀원</th><th>인입</th><th>계약</th><th>일정</th><th>정산금액</th></tr></thead>
          <tbody>
            {summaries.map((item) => (
              <tr key={item.userId}>
                <td>{item.name}</td>
                <td>{item.customerInflowCount}명</td>
                <td>{item.contractCustomerCount}명</td>
                <td>{item.scheduleCount}건</td>
                <td>{formatWon(item.settlementAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamSimpleTable({ title, rows, columns }) {
  return (
    <div className="dashboard-card">
      <h2>{title}</h2>
      <div className="team-table-wrap">
        <table className="team-table">
          <thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || JSON.stringify(row)}>
                {columns.map(([key, label]) => <td key={label}>{typeof key === "function" ? key(row) : row[key] || "-"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <div className="empty-state">표시할 데이터가 없습니다.</div> : null}
    </div>
  );
}

export default TeamModePage;
