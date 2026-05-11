# AgentNote AI Briefing

AI Briefing compares one customer against 2 to 5 candidate properties and creates a broker-ready briefing.

## Architecture

- Frontend route: `/ai-briefing`
- UI entry: sidebar item `AI 브리핑`
- Rule-based scoring: `frontend/src/utils/aiBriefing.js`
- Browser service client: `frontend/src/services/aiBriefingService.js`
- Server-only Vercel Functions:
  - `POST /api/ai-briefings/generate`
  - `POST /api/ai-briefings`
  - `GET /api/ai-briefings?customerId=...`
  - `POST /api/customer-property-feedback`
  - `GET /api/ai-usage`
- Supabase migration: `docs/AI_BRIEFING_SUPABASE.sql`

## Safety Rules

The LLM does not decide score or rank. The server calculates deterministic rule-based scores first, then sends the minimized input and scoring result to OpenAI for wording only.

The server validates the LLM result before returning it:

- `propertyId`, `rank`, and `score` are repaired back to the server-calculated values.
- Unsupported or suspicious wording is sanitized.
- Missing fields, invalid JSON, API errors, budget blocks, or missing API keys all fall back to rule-based copy.
- Customer phone numbers, email addresses, and unrelated PII are not sent to OpenAI.
- No OpenAI tools are enabled. This feature only performs text generation.

## Production Setup

Run the SQL migration in Supabase SQL Editor:

```sql
-- paste docs/AI_BRIEFING_SUPABASE.sql
```

Add these Vercel Project Settings > Environment Variables:

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-nano
OPENAI_MODEL_FALLBACK=gpt-5-nano
AI_ENABLE_LLM=true
AI_MONTHLY_USD_HARD_LIMIT=5
AI_DAILY_USD_HARD_LIMIT=0.5
AI_PER_REQUEST_USD_HARD_LIMIT=0.02
AI_MAX_INPUT_TOKENS=6000
AI_MAX_OUTPUT_TOKENS=1200
AI_MAX_INPUT_CHARS=16000
AI_MAX_PROPERTY_COUNT=5
AI_MIN_PROPERTY_COUNT=2
AI_MEMO_MAX_CHARS=500
AI_TIMEOUT_MS=60000
AI_RETRY_COUNT=0
AI_SHOW_COST_TO_ADMIN=true
```

Keep `OPENAI_API_KEY` server-only. Do not prefix it with `VITE_`, `NEXT_PUBLIC_`, or any other public-client prefix.

## Fallback Modes

- `llm`: OpenAI succeeded and the response passed validation.
- `rule_based`: LLM is disabled by `AI_ENABLE_LLM=false`.
- `api_key_missing`: `OPENAI_API_KEY` is not set.
- `budget_exceeded`: monthly, daily, per-request, input-token, or input-char limits blocked the call before OpenAI was contacted.
- `fallback`: OpenAI failed or returned an invalid response, so the rule-based briefing was returned.

## Local Test

```bash
cd frontend
npm install
npm test
npm run build
npm run dev
```

Without `OPENAI_API_KEY`, local development should still generate a rule-based briefing.
