create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source_schedule_id uuid unique references public.schedules(id) on delete set null,
  customer_name text,
  phone text,
  settlement_date date,
  tenant_fee numeric default 0,
  landlord_fee numeric default 0,
  total_fee numeric default 0,
  status text default '정산대기',
  memo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.settlements enable row level security;

drop policy if exists settlements_select_own on public.settlements;
drop policy if exists settlements_insert_own on public.settlements;
drop policy if exists settlements_update_own on public.settlements;
drop policy if exists settlements_delete_own on public.settlements;

create policy settlements_select_own on public.settlements
  for select using (auth.uid() = user_id);

create policy settlements_insert_own on public.settlements
  for insert with check (auth.uid() = user_id);

create policy settlements_update_own on public.settlements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy settlements_delete_own on public.settlements
  for delete using (auth.uid() = user_id);
