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

## First account seed

After the first deploy, run the backend seed command once from Railway shell:

```bash
python init_db.py
```

Then immediately change the default passwords by editing `backend/init_db.py` locally before production use, or add a small admin password-change screen.
