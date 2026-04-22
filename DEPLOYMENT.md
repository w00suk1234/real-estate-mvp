# Railway + Cloudflare R2 deployment checklist

## Railway

1. Create a Railway Hobby workspace.
2. In Workspace Usage, set:
   - Email alert: 10 USD
   - Hard limit: 20 USD
3. Create a new project from the GitHub repository.
4. Add a Postgres service.
5. Add these variables to the app service:
   - `AUTH_SECRET`
   - `DATABASE_URL` from Railway Postgres
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `VIEWER_USERNAME`
   - `VIEWER_PASSWORD`
   - `STORAGE_BACKEND` = `r2`
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_BASE_URL`
6. Deploy. The Dockerfile builds the React frontend and serves it through FastAPI.

## Cloudflare R2

1. Create one R2 bucket.
2. Create an R2 API token with object read/write access to that bucket.
3. Make a public bucket URL or custom public domain.
4. Put the public base URL into `R2_PUBLIC_BASE_URL`.
5. After Railway redeploys, open `/health/storage` on the deployed app.
   - `active_backend` should be `r2`.
   - `r2_enabled` should be `true`.
   - `missing_r2_variables` should be empty.

Set `STORAGE_BACKEND=r2` in production. This prevents the app from silently
falling back to Railway's temporary disk when R2 is not configured correctly.
Railway temporary disk is fine for local smoke tests, but not for real saved
photos or generated brochure files.

## First account seed

When `ADMIN_USERNAME` and `ADMIN_PASSWORD` are present, the app creates that
admin account automatically if it does not already exist. `VIEWER_USERNAME` and
`VIEWER_PASSWORD` work the same way for a read-only viewer account.

Do not use the local defaults (`admin1234`, `viewer1234`) in production.
