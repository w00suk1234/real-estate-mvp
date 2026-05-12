# AgentNote Team Mode Setup

This checklist fixes the production error:

> Could not find the table 'public.team_members' in the schema cache

That error means the deployed app is connected to a Supabase project where the Team Mode tables have not been created yet, or PostgREST has not refreshed its schema cache after the SQL change.

## 1. Run Supabase SQL

1. Open Supabase Dashboard.
2. Select the same Supabase project used by the deployed AgentNote site.
3. Go to SQL Editor.
4. Open `docs/TEAM_MODE_SUPABASE.sql`.
5. Paste the full SQL into the editor.
6. Click Run.

The SQL is idempotent. It uses `create table if not exists`, `alter table ... add column if not exists`, `drop policy if exists`, and `create policy`, so it can be executed again if needed.

## 2. Confirm Tables

After running the SQL, confirm these tables exist in the `public` schema:

- `teams`
- `team_members`
- `team_invitations`
- `team_subscriptions`
- `customer_assignments`
- `customer_transfer_logs`
- `payroll_statements`

Also confirm these existing tables have Team Mode columns when the tables exist:

- `customers.team_id`
- `customers.assigned_to_user_id`
- `customers.created_by_user_id`
- `schedules.team_id`
- `schedules.assigned_to_user_id`
- `schedules.created_by_user_id`
- `settlements.team_id`
- `settlements.assigned_to_user_id`
- `settlements.created_by_user_id`

## 3. Check Vercel Environment Variables

AgentNote reads Supabase with these public Vite variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Some older deployments may use:

- `VITE_SUPABASE_PUBLISHABLE_KEY`

Make sure the `VITE_SUPABASE_URL` in Vercel points to the same Supabase project where you ran `TEAM_MODE_SUPABASE.sql`.

Common mistake:

- SQL was run in Project A.
- Vercel production still points to Project B.
- The app still reports `public.team_members` missing.

## 4. Redeploy / Refresh

The SQL ends with:

```sql
select pg_notify('pgrst', 'reload schema');
```

This asks Supabase PostgREST to refresh the schema cache. If the error persists:

1. Wait 30-60 seconds.
2. Hard refresh the browser.
3. Redeploy the Vercel project.
4. Confirm `VITE_SUPABASE_URL` again.

## 5. Test Team Creation

After setup:

1. Log in to AgentNote.
2. Open `/team` or click the topbar Team Mode switch.
3. Enter a team name.
4. Click `팀 만들기`.

Expected rows:

- `teams`: one team row with `owner_user_id = auth.uid()`.
- `team_members`: one row with `role = owner`, `status = active`.
- `team_subscriptions`: one row with `status = trialing`, `plan_type = team_basic`, `seat_limit = 5`.

## 6. Troubleshooting

### `public.team_members` schema cache error

Run `docs/TEAM_MODE_SUPABASE.sql` in the correct Supabase project, then wait for schema cache reload.

### Table exists but column is missing

Run the SQL again. It includes `add column if not exists` for the Team Mode columns.

### RLS / permission error

Review the RLS policies in `docs/TEAM_MODE_SUPABASE.sql`.

The MVP uses anon key + RLS. Do not expose a Supabase service role key in the client.

### Team creates `teams` but fails on `team_members`

Run the SQL again and verify `team_members` exists. The app attempts to clean up a partially created team row if membership or subscription creation fails.

### Invite link fails

Check:

- `team_invitations` exists.
- The inviter has `owner` or `admin` role in `team_members`.
- The active/pending seat count is below the plan limit.

