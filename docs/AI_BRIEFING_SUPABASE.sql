-- AgentNote AI Briefing tables
-- Run this in Supabase SQL Editor before using the AI Briefing page in production.

create extension if not exists pgcrypto;

create table if not exists public.ai_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text,
  summary text,
  result_json jsonb not null default '{}'::jsonb,
  model text,
  mode text not null check (mode in ('rule_based', 'llm', 'fallback', 'budget_exceeded', 'api_key_missing')),
  estimated_cost_usd numeric(12, 8),
  actual_cost_usd numeric(12, 8),
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_briefing_properties (
  id uuid primary key default gen_random_uuid(),
  ai_briefing_id uuid not null references public.ai_briefings(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  rank integer,
  score integer,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_property_feedback (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  ai_briefing_id uuid references public.ai_briefings(id) on delete set null,
  feedback_type text not null check (
    feedback_type in (
      'interested',
      'visit_requested',
      'price_burden',
      'location_bad',
      'parking_issue',
      'size_small',
      'size_large',
      'hold',
      'rejected',
      'other'
    )
  ),
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ai_briefing_id uuid references public.ai_briefings(id) on delete set null,
  feature text not null default 'ai_briefing',
  model text,
  mode text not null check (mode in ('llm', 'rule_based', 'fallback', 'budget_exceeded', 'api_key_missing', 'error')),
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(12, 8) not null default 0,
  actual_cost_usd numeric(12, 8),
  request_chars integer,
  response_chars integer,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ai_briefings_user_created_idx on public.ai_briefings(user_id, created_at desc);
create index if not exists ai_briefings_customer_idx on public.ai_briefings(customer_id, created_at desc);
create index if not exists ai_briefing_properties_briefing_idx on public.ai_briefing_properties(ai_briefing_id);
create index if not exists ai_briefing_properties_property_idx on public.ai_briefing_properties(property_id);
create index if not exists customer_property_feedback_customer_idx on public.customer_property_feedback(customer_id, created_at desc);
create index if not exists ai_usage_logs_user_created_idx on public.ai_usage_logs(user_id, created_at desc);
create index if not exists ai_usage_logs_feature_created_idx on public.ai_usage_logs(feature, created_at desc);

alter table public.ai_briefings enable row level security;
alter table public.ai_briefing_properties enable row level security;
alter table public.customer_property_feedback enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists "ai_briefings_select_own" on public.ai_briefings;
create policy "ai_briefings_select_own"
  on public.ai_briefings for select
  using (auth.uid() = user_id);

drop policy if exists "ai_briefings_insert_own" on public.ai_briefings;
create policy "ai_briefings_insert_own"
  on public.ai_briefings for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.customers
      where customers.id = customer_id
      and customers.user_id = auth.uid()
    )
  );

drop policy if exists "ai_briefings_update_own" on public.ai_briefings;
create policy "ai_briefings_update_own"
  on public.ai_briefings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ai_briefing_properties_select_own" on public.ai_briefing_properties;
create policy "ai_briefing_properties_select_own"
  on public.ai_briefing_properties for select
  using (
    exists (
      select 1 from public.ai_briefings
      where ai_briefings.id = ai_briefing_id
      and ai_briefings.user_id = auth.uid()
    )
  );

drop policy if exists "ai_briefing_properties_insert_own" on public.ai_briefing_properties;
create policy "ai_briefing_properties_insert_own"
  on public.ai_briefing_properties for insert
  with check (
    exists (
      select 1 from public.ai_briefings
      where ai_briefings.id = ai_briefing_id
      and ai_briefings.user_id = auth.uid()
    )
    and exists (
      select 1 from public.properties
      where properties.id = property_id
      and properties.user_id = auth.uid()
    )
  );

drop policy if exists "customer_property_feedback_select_own" on public.customer_property_feedback;
create policy "customer_property_feedback_select_own"
  on public.customer_property_feedback for select
  using (
    exists (
      select 1 from public.customers
      where customers.id = customer_id
      and customers.user_id = auth.uid()
    )
  );

drop policy if exists "customer_property_feedback_insert_own" on public.customer_property_feedback;
create policy "customer_property_feedback_insert_own"
  on public.customer_property_feedback for insert
  with check (
    exists (
      select 1 from public.customers
      where customers.id = customer_id
      and customers.user_id = auth.uid()
    )
    and (
      property_id is null
      or exists (
        select 1 from public.properties
        where properties.id = property_id
        and properties.user_id = auth.uid()
      )
    )
  );

drop policy if exists "ai_usage_logs_select_own" on public.ai_usage_logs;
create policy "ai_usage_logs_select_own"
  on public.ai_usage_logs for select
  using (auth.uid() = user_id);

drop policy if exists "ai_usage_logs_insert_own" on public.ai_usage_logs;
create policy "ai_usage_logs_insert_own"
  on public.ai_usage_logs for insert
  with check (auth.uid() = user_id);
