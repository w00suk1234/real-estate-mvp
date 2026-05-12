-- AgentNote Team Mode MVP setup.
--
-- Run this in Supabase SQL editor before enabling team mode in production.
-- Existing personal rows remain personal because team_id is nullable.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null,
  plan_type text not null default 'team_basic',
  seat_limit integer not null default 5,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_plan_type_check check (plan_type in ('personal', 'team_basic', 'team_extra', 'team_unlimited')),
  constraint teams_status_check check (status in ('active', 'suspended', 'deleted'))
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  status text not null default 'active',
  invited_by uuid null,
  joined_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_team_user_unique unique (team_id, user_id),
  constraint team_members_role_check check (role in ('owner', 'admin', 'member', 'viewer')),
  constraint team_members_status_check check (status in ('active', 'invited', 'suspended', 'left'))
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text null,
  role text not null default 'member',
  token_hash text not null,
  status text not null default 'pending',
  invited_by uuid not null,
  expires_at timestamptz not null,
  accepted_at timestamptz null,
  accepted_by uuid null,
  created_at timestamptz not null default now(),
  constraint team_invitations_role_check check (role in ('admin', 'member', 'viewer')),
  constraint team_invitations_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create table if not exists public.team_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  plan_type text not null,
  status text not null default 'trialing',
  seat_limit integer not null default 5,
  extra_seat_count integer not null default 0,
  is_unlimited boolean not null default false,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  provider text null,
  provider_subscription_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_subscriptions_plan_type_check check (plan_type in ('personal', 'team_basic', 'team_extra', 'team_unlimited')),
  constraint team_subscriptions_status_check check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired'))
);

create table if not exists public.customer_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  customer_id uuid not null,
  assigned_to_user_id uuid not null,
  assigned_by_user_id uuid not null,
  memo text null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_transfer_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  customer_id uuid not null,
  from_user_id uuid null,
  to_user_id uuid not null,
  transferred_by_user_id uuid not null,
  reason text null,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_statements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  month text not null,
  title text null,
  base_pay numeric not null default 0,
  commission_pay numeric not null default 0,
  bonus_pay numeric not null default 0,
  deduction_amount numeric not null default 0,
  total_pay numeric not null default 0,
  memo text null,
  status text not null default 'draft',
  delivered_at timestamptz null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_status_check check (status in ('draft', 'delivered', 'canceled'))
);

alter table if exists public.customers
  add column if not exists team_id uuid null references public.teams(id) on delete set null,
  add column if not exists assigned_to_user_id uuid null,
  add column if not exists created_by_user_id uuid null;

alter table if exists public.schedules
  add column if not exists team_id uuid null references public.teams(id) on delete set null,
  add column if not exists assigned_to_user_id uuid null,
  add column if not exists created_by_user_id uuid null;

alter table if exists public.settlements
  add column if not exists team_id uuid null references public.teams(id) on delete set null,
  add column if not exists assigned_to_user_id uuid null,
  add column if not exists created_by_user_id uuid null;

create index if not exists team_members_user_idx on public.team_members(user_id, status);
create index if not exists team_members_team_idx on public.team_members(team_id, role, status);
create index if not exists team_invitations_hash_idx on public.team_invitations(token_hash, status);
create index if not exists team_subscriptions_team_idx on public.team_subscriptions(team_id, status);
create index if not exists customers_team_assignee_idx on public.customers(team_id, assigned_to_user_id);
create index if not exists schedules_team_assignee_date_idx on public.schedules(team_id, assigned_to_user_id, schedule_date);
create index if not exists settlements_team_assignee_date_idx on public.settlements(team_id, assigned_to_user_id, balance_date);
create index if not exists payroll_team_user_month_idx on public.payroll_statements(team_id, user_id, month);

create or replace function public.is_team_member(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.has_team_role(target_team_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where team_id = target_team_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(allowed_roles)
  );
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.team_subscriptions enable row level security;
alter table public.customer_assignments enable row level security;
alter table public.customer_transfer_logs enable row level security;
alter table public.payroll_statements enable row level security;

drop policy if exists "team members can view teams" on public.teams;
create policy "team members can view teams" on public.teams
for select using (public.is_team_member(id));

drop policy if exists "authenticated users create owned teams" on public.teams;
create policy "authenticated users create owned teams" on public.teams
for insert with check (owner_user_id = auth.uid());

drop policy if exists "team owners admins update teams" on public.teams;
create policy "team owners admins update teams" on public.teams
for update using (public.has_team_role(id, array['owner','admin']));

drop policy if exists "team members can view team members" on public.team_members;
create policy "team members can view team members" on public.team_members
for select using (public.is_team_member(team_id));

drop policy if exists "users can create own membership" on public.team_members;
create policy "users can create own membership" on public.team_members
for insert with check (user_id = auth.uid());

drop policy if exists "owners admins update members" on public.team_members;
create policy "owners admins update members" on public.team_members
for update using (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "owners admins manage invitations" on public.team_invitations;
create policy "owners admins manage invitations" on public.team_invitations
for all using (public.has_team_role(team_id, array['owner','admin']))
with check (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "members can view subscriptions" on public.team_subscriptions;
create policy "members can view subscriptions" on public.team_subscriptions
for select using (public.is_team_member(team_id));

drop policy if exists "team owner can create subscription" on public.team_subscriptions;
create policy "team owner can create subscription" on public.team_subscriptions
for insert with check (public.has_team_role(team_id, array['owner']));

drop policy if exists "team owner can update subscription" on public.team_subscriptions;
create policy "team owner can update subscription" on public.team_subscriptions
for update using (public.has_team_role(team_id, array['owner']));

drop policy if exists "owners admins view assignments" on public.customer_assignments;
create policy "owners admins view assignments" on public.customer_assignments
for select using (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "owners admins write assignments" on public.customer_assignments;
create policy "owners admins write assignments" on public.customer_assignments
for insert with check (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "owners admins view transfer logs" on public.customer_transfer_logs;
create policy "owners admins view transfer logs" on public.customer_transfer_logs
for select using (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "owners admins write transfer logs" on public.customer_transfer_logs;
create policy "owners admins write transfer logs" on public.customer_transfer_logs
for insert with check (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "payroll scoped view" on public.payroll_statements;
create policy "payroll scoped view" on public.payroll_statements
for select using (
  public.has_team_role(team_id, array['owner','admin'])
  or user_id = auth.uid()
);

drop policy if exists "owners admins write payroll" on public.payroll_statements;
create policy "owners admins write payroll" on public.payroll_statements
for all using (public.has_team_role(team_id, array['owner','admin']))
with check (public.has_team_role(team_id, array['owner','admin']));

-- Existing customers/schedules/settlements policies vary by project.
-- Add or update policies so that:
-- owner/admin can select/update rows with matching team_id,
-- member can select/update rows assigned_to_user_id = auth.uid(),
-- personal rows with team_id is null remain restricted to the original user_id owner.
--
-- Example select policy for customers:
-- create policy "team scoped customers" on public.customers
-- for select using (
--   user_id = auth.uid()
--   or (team_id is not null and public.has_team_role(team_id, array['owner','admin']))
--   or (team_id is not null and assigned_to_user_id = auth.uid())
-- );
