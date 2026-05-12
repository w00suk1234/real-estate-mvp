-- AgentNote Team Mode MVP setup.
--
-- Run this in the Supabase SQL Editor for the same project used by Vercel.
-- This script is intentionally idempotent: it can be executed more than once.
-- Existing personal rows remain personal because team_id is nullable.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core team tables
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null,
  plan_type text not null default 'team_basic',
  seat_limit integer not null default 5,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teams add column if not exists name text not null default 'AgentNote Team';
alter table public.teams add column if not exists owner_user_id uuid;
alter table public.teams add column if not exists plan_type text not null default 'team_basic';
alter table public.teams add column if not exists seat_limit integer not null default 5;
alter table public.teams add column if not exists status text not null default 'active';
alter table public.teams add column if not exists created_at timestamptz not null default now();
alter table public.teams add column if not exists updated_at timestamptz not null default now();

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
  unique (team_id, user_id)
);

alter table public.team_members add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.team_members add column if not exists user_id uuid;
alter table public.team_members add column if not exists role text not null default 'member';
alter table public.team_members add column if not exists status text not null default 'active';
alter table public.team_members add column if not exists invited_by uuid null;
alter table public.team_members add column if not exists joined_at timestamptz null;
alter table public.team_members add column if not exists created_at timestamptz not null default now();
alter table public.team_members add column if not exists updated_at timestamptz not null default now();

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
  created_at timestamptz not null default now()
);

alter table public.team_invitations add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.team_invitations add column if not exists email text null;
alter table public.team_invitations add column if not exists role text not null default 'member';
alter table public.team_invitations add column if not exists token_hash text;
alter table public.team_invitations add column if not exists status text not null default 'pending';
alter table public.team_invitations add column if not exists invited_by uuid;
alter table public.team_invitations add column if not exists expires_at timestamptz;
alter table public.team_invitations add column if not exists accepted_at timestamptz null;
alter table public.team_invitations add column if not exists accepted_by uuid null;
alter table public.team_invitations add column if not exists created_at timestamptz not null default now();

create table if not exists public.team_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  plan_type text not null default 'team_basic',
  status text not null default 'trialing',
  seat_limit integer not null default 5,
  extra_seat_count integer not null default 0,
  is_unlimited boolean not null default false,
  current_period_start timestamptz null,
  current_period_end timestamptz null,
  provider text null,
  provider_subscription_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.team_subscriptions add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.team_subscriptions add column if not exists plan_type text not null default 'team_basic';
alter table public.team_subscriptions add column if not exists status text not null default 'trialing';
alter table public.team_subscriptions add column if not exists seat_limit integer not null default 5;
alter table public.team_subscriptions add column if not exists extra_seat_count integer not null default 0;
alter table public.team_subscriptions add column if not exists is_unlimited boolean not null default false;
alter table public.team_subscriptions add column if not exists current_period_start timestamptz null;
alter table public.team_subscriptions add column if not exists current_period_end timestamptz null;
alter table public.team_subscriptions add column if not exists provider text null;
alter table public.team_subscriptions add column if not exists provider_subscription_id text null;
alter table public.team_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.team_subscriptions add column if not exists updated_at timestamptz not null default now();

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

alter table public.customer_assignments add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.customer_assignments add column if not exists customer_id uuid;
alter table public.customer_assignments add column if not exists assigned_to_user_id uuid;
alter table public.customer_assignments add column if not exists assigned_by_user_id uuid;
alter table public.customer_assignments add column if not exists memo text null;
alter table public.customer_assignments add column if not exists assigned_at timestamptz not null default now();
alter table public.customer_assignments add column if not exists created_at timestamptz not null default now();

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

alter table public.customer_transfer_logs add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.customer_transfer_logs add column if not exists customer_id uuid;
alter table public.customer_transfer_logs add column if not exists from_user_id uuid null;
alter table public.customer_transfer_logs add column if not exists to_user_id uuid;
alter table public.customer_transfer_logs add column if not exists transferred_by_user_id uuid;
alter table public.customer_transfer_logs add column if not exists reason text null;
alter table public.customer_transfer_logs add column if not exists created_at timestamptz not null default now();

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
  updated_at timestamptz not null default now()
);

alter table public.payroll_statements add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.payroll_statements add column if not exists user_id uuid;
alter table public.payroll_statements add column if not exists month text;
alter table public.payroll_statements add column if not exists title text null;
alter table public.payroll_statements add column if not exists base_pay numeric not null default 0;
alter table public.payroll_statements add column if not exists commission_pay numeric not null default 0;
alter table public.payroll_statements add column if not exists bonus_pay numeric not null default 0;
alter table public.payroll_statements add column if not exists deduction_amount numeric not null default 0;
alter table public.payroll_statements add column if not exists total_pay numeric not null default 0;
alter table public.payroll_statements add column if not exists memo text null;
alter table public.payroll_statements add column if not exists status text not null default 'draft';
alter table public.payroll_statements add column if not exists delivered_at timestamptz null;
alter table public.payroll_statements add column if not exists created_by uuid;
alter table public.payroll_statements add column if not exists created_at timestamptz not null default now();
alter table public.payroll_statements add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Extend existing app tables when they exist.
-- ---------------------------------------------------------------------------

alter table if exists public.customers add column if not exists team_id uuid null references public.teams(id) on delete set null;
alter table if exists public.customers add column if not exists assigned_to_user_id uuid null;
alter table if exists public.customers add column if not exists created_by_user_id uuid null;

alter table if exists public.schedules add column if not exists team_id uuid null references public.teams(id) on delete set null;
alter table if exists public.schedules add column if not exists assigned_to_user_id uuid null;
alter table if exists public.schedules add column if not exists created_by_user_id uuid null;

alter table if exists public.events add column if not exists team_id uuid null references public.teams(id) on delete set null;
alter table if exists public.events add column if not exists assigned_to_user_id uuid null;
alter table if exists public.events add column if not exists created_by_user_id uuid null;

alter table if exists public.settlements add column if not exists team_id uuid null references public.teams(id) on delete set null;
alter table if exists public.settlements add column if not exists assigned_to_user_id uuid null;
alter table if exists public.settlements add column if not exists created_by_user_id uuid null;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists teams_owner_user_idx on public.teams(owner_user_id);
create index if not exists team_members_team_idx on public.team_members(team_id);
create index if not exists team_members_user_idx on public.team_members(user_id);
create unique index if not exists team_members_team_user_idx on public.team_members(team_id, user_id);
create index if not exists team_subscriptions_team_idx on public.team_subscriptions(team_id);
create index if not exists team_invitations_hash_idx on public.team_invitations(token_hash);
create index if not exists customer_assignments_team_idx on public.customer_assignments(team_id);
create index if not exists customer_assignments_customer_idx on public.customer_assignments(customer_id);
create index if not exists customer_transfer_logs_team_idx on public.customer_transfer_logs(team_id);
create index if not exists payroll_team_month_idx on public.payroll_statements(team_id, month);
create index if not exists payroll_user_month_idx on public.payroll_statements(user_id, month);

do $$
begin
  if to_regclass('public.customers') is not null then
    execute 'create index if not exists customers_team_assignee_idx on public.customers(team_id, assigned_to_user_id)';
  end if;

  if to_regclass('public.schedules') is not null then
    execute 'create index if not exists schedules_team_assignee_idx on public.schedules(team_id, assigned_to_user_id)';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'schedules' and column_name = 'schedule_date'
    ) then
      execute 'create index if not exists schedules_team_assignee_date_idx on public.schedules(team_id, assigned_to_user_id, schedule_date)';
    end if;
  end if;

  if to_regclass('public.events') is not null then
    execute 'create index if not exists events_team_assignee_idx on public.events(team_id, assigned_to_user_id)';
  end if;

  if to_regclass('public.settlements') is not null then
    execute 'create index if not exists settlements_team_assignee_idx on public.settlements(team_id, assigned_to_user_id)';
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'settlements' and column_name = 'balance_date'
    ) then
      execute 'create index if not exists settlements_team_assignee_date_idx on public.settlements(team_id, assigned_to_user_id, balance_date)';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Role helpers for RLS policies
-- ---------------------------------------------------------------------------

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

create or replace function public.has_pending_team_invitation(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_invitations
    where team_id = target_team_id
      and status = 'pending'
      and expires_at > now()
      and (
        email is null
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS for team-mode tables
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.team_subscriptions enable row level security;
alter table public.customer_assignments enable row level security;
alter table public.customer_transfer_logs enable row level security;
alter table public.payroll_statements enable row level security;

drop policy if exists "team members can view teams" on public.teams;
create policy "team members can view teams" on public.teams
for select using (owner_user_id = auth.uid() or public.is_team_member(id));

drop policy if exists "authenticated users create owned teams" on public.teams;
create policy "authenticated users create owned teams" on public.teams
for insert with check (owner_user_id = auth.uid());

drop policy if exists "team owners admins update teams" on public.teams;
create policy "team owners admins update teams" on public.teams
for update using (public.has_team_role(id, array['owner','admin']));

drop policy if exists "team members can view team members" on public.team_members;
create policy "team members can view team members" on public.team_members
for select using (public.is_team_member(team_id) or user_id = auth.uid());

drop policy if exists "users can create own membership" on public.team_members;
create policy "users can create own membership" on public.team_members
for insert with check (
  user_id = auth.uid()
  and (
    exists (
      select 1 from public.teams
      where teams.id = team_members.team_id
        and teams.owner_user_id = auth.uid()
    )
    or public.has_pending_team_invitation(team_id)
  )
);

drop policy if exists "owners admins update members" on public.team_members;
create policy "owners admins update members" on public.team_members
for update using (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "owners admins manage invitations" on public.team_invitations;
drop policy if exists "team invitations scoped select" on public.team_invitations;
create policy "team invitations scoped select" on public.team_invitations
for select using (
  public.has_team_role(team_id, array['owner','admin'])
  or public.has_pending_team_invitation(team_id)
);

drop policy if exists "owners admins insert invitations" on public.team_invitations;
create policy "owners admins insert invitations" on public.team_invitations
for insert with check (public.has_team_role(team_id, array['owner','admin']));

drop policy if exists "team invitations scoped update" on public.team_invitations;
create policy "team invitations scoped update" on public.team_invitations
for update using (
  public.has_team_role(team_id, array['owner','admin'])
  or public.has_pending_team_invitation(team_id)
)
with check (
  public.has_team_role(team_id, array['owner','admin'])
  or (
    accepted_by = auth.uid()
    and status in ('accepted', 'revoked')
  )
);

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

-- ---------------------------------------------------------------------------
-- Optional RLS for existing app tables.
-- These policies assume customers/schedules/settlements have user_id.
-- If your project already has stricter policies, review and merge manually.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.customers') is not null then
    execute 'drop policy if exists "team scoped customers select" on public.customers';
    execute 'create policy "team scoped customers select" on public.customers for select using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
    execute 'drop policy if exists "team scoped customers update" on public.customers';
    execute 'create policy "team scoped customers update" on public.customers for update using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
  end if;

  if to_regclass('public.schedules') is not null then
    execute 'drop policy if exists "team scoped schedules select" on public.schedules';
    execute 'create policy "team scoped schedules select" on public.schedules for select using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
    execute 'drop policy if exists "team scoped schedules update" on public.schedules';
    execute 'create policy "team scoped schedules update" on public.schedules for update using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
  end if;

  if to_regclass('public.settlements') is not null then
    execute 'drop policy if exists "team scoped settlements select" on public.settlements';
    execute 'create policy "team scoped settlements select" on public.settlements for select using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
    execute 'drop policy if exists "team scoped settlements update" on public.settlements';
    execute 'create policy "team scoped settlements update" on public.settlements for update using (
      user_id = auth.uid()
      or (team_id is not null and public.has_team_role(team_id, array[''owner'',''admin'']))
      or (team_id is not null and assigned_to_user_id = auth.uid())
    )';
  end if;
end $$;

-- Ask Supabase PostgREST to refresh the schema cache after DDL.
select pg_notify('pgrst', 'reload schema');
