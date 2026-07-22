# Deploy to Railway

This app is a **Next.js 16** App Router project with **long-running** API routes (`/api/simulate`, artifact regeneration), **auth sessions**, and **Upstash rate limits**. Use this checklist for a first production deploy.

## 1. Prerequisites

- A GitHub (or GitLab / Bitbucket) repo connected to Railway.
- A **Neon** Postgres database for `DATABASE_URL`.
- A **DeepSeek** API key for `DEEPSEEK_API_KEY`.
- An **Upstash Redis** database for rate limiting (create at [upstash.com](https://upstash.com)).
- A strong **`AUTH_SECRET`** for JWT session signing (e.g. `openssl rand -base64 32`).
- Railway runs on **Node.js 22+** — a `.nvmrc` file in the repo root pins this version.

## 2. Environment variables

In Railway project → **Variables**, configure at least:

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | ✓ | Pooled Postgres URL from Neon. |
| `DEEPSEEK_API_KEY` | ✓ | Simulations and artifact generation. |
| `AUTH_SECRET` | ✓ | **Required in production** — JWT session signing (`src/lib/auth/auth-session.ts`). |
| `NEXT_PUBLIC_APP_URL` | ✓ | Canonical origin (no trailing slash). Used for Origin allowlist on mutating `/api` routes and artifact synthesize worker dispatch. Example: `https://ai-engineering-team-simulator.up.railway.app`. |
| `UPSTASH_REDIS_REST_URL` | ✓ | Rate limiting (simulate, delete, export, regenerate, auth). |
| `UPSTASH_REDIS_REST_TOKEN` | ✓ | Pair with URL above. |

Optional:

| Variable | Notes |
|---------|-------|
| `DIRECT_DATABASE_URL` | Non-pooled Neon URL for `prisma migrate deploy` (advisory locks). Also accepts `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`. Falls back to stripping `-pooler` from `DATABASE_URL`. See `scripts/resolve-migrate-database-url.mjs`. |
| `SIMULATION_MAX_COST_USD` | Per-run USD ceiling for classification + debate + artifacts + regeneration (default `0.75`). |
| `RATE_LIMIT_SIMULATE_GUEST` | Default `3` simulations per hour per IP (guest). |
| `RATE_LIMIT_SIMULATE_AUTH` | Default `30` simulations per hour per signed-in user. |
| `RATE_LIMIT_REGENERATE_GUEST` | Default `3` regenerations per hour (guest). |
| `RATE_LIMIT_REGENERATE_AUTH` | Default `10` regenerations per hour (signed in). |
| `RATE_LIMIT_EXPORT_PDF` | Default `5` exports per hour (MD + PDF share bucket). |
| `RATE_LIMIT_DELETE` | Default `30` deletes per hour. |
| `RATE_LIMIT_AUTH_LOGIN` | Default `10` login attempts per 15 min per IP + email hash. |
| `RATE_LIMIT_AUTH_REGISTER` | Default `10` register attempts per 15 min per IP + email hash. |
| `RATE_LIMIT_DISABLED` | Set `true` to bypass limits (not recommended in production). |
| `DEEPSEEK_*_USD_PER_M` | Override model pricing for usage/cost estimates — see [.env.example](.env.example). |

See [.env.example](.env.example) for a full local template.

## 3. Build command

Railway uses `npm run build` (configured in `railway.toml`), which runs:

1. `prisma generate`
2. `node scripts/prisma-migrate-deploy-if-url.mjs` — runs `prisma migrate deploy` with up to 3 retries, **only when `DATABASE_URL` is defined** (resolves a non-pooled connection from `DIRECT_DATABASE_URL` / `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING`, or strips `-pooler` from `DATABASE_URL`)
3. `next build`

If `DATABASE_URL` is missing during build (e.g. CI), migrations are skipped with a warning. Railway production builds **must** have `DATABASE_URL` so migrations apply before the app boots.

## 4. Function duration (multi-agent runs)

Railway does not impose serverless function duration limits — the app runs as a long-lived Node.js process. The `maxDuration` exports on API routes (`300` seconds on simulate/artifacts, `120` on export routes) are benign and only have effect on platforms like Vercel.

Six agents + artifact synthesis can take several minutes on complex debates. The `railway.toml` includes:

```toml
[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/"
healthcheckTimeout = 300
```

This ensures Railway waits for the health check and restarts only on failure.

## 5. First deploy

1. **Connect** the repository in Railway.
2. **Add environment variables** under Variables — at minimum `DATABASE_URL`, `DEEPSEEK_API_KEY`, `AUTH_SECRET`, and Upstash Redis vars.
3. **Ensure `.nvmrc`** exists at repo root with `22` to pin Node.js version.
4. **Ensure `nixpacks.toml`** includes `unzip` (required by `md-to-pdf` / Puppeteer for Chrome browser extraction during `npm i`).
5. Deploy. Watch the build log for `prisma migrate deploy` succeeding.

After deploy, Railway enables **Public Networking** automatically when configured. The production URL follows the pattern:

```
https://<service-name>.up.railway.app
```

Example: [ai-engineering-team-simulator.up.railway.app](https://ai-engineering-team-simulator.up.railway.app)

### Bootstrap admin user (optional)

After the first deploy with a working `DATABASE_URL`:

```bash
DATABASE_URL=... ADMIN_INITIAL_PASSWORD=... npx tsx scripts/create-admin-user.ts
```

Creates `admin@ai-team-simulation.dev` if it does not exist. Store the password securely.

## 6. Smoke test

After deploy:

1. Open `/` — landing loads (animated hero + footer).
2. Submit a short prompt — six agents stream, usage pill appears in header, redirect to `/runs/[id]`.
3. Open `/runs/[id]` — thread, artifacts, and token/cost badge appear.
4. Sidebar lists the run under your guest session (or signed-in account).
5. **Export** — guests are prompted to sign in; register/login, then export succeeds.
6. **Delete** — remove a run from the sidebar; another user's run ID returns **404** (not 403).
7. **Rate limit** — repeated simulate calls eventually return `429` (if Upstash is configured).
8. **Auth rate limit** — many rapid login attempts from the same IP/email return `429` with `Retry-After`.
9. **Regenerate** — use the header regenerate control; spamming returns a rate-limit message in the UI.

If streaming fails with 5xx, check Railway **Deploy Logs** and confirm `DEEPSEEK_API_KEY`, `DATABASE_URL`, and `AUTH_SECRET` are set.

If simulate returns `503` with a rate-limit message, confirm Upstash env vars are present.

## 7. Ongoing operations

- **Schema changes:** commit a new Prisma migration under `prisma/migrations/`, then deploy; `migrate deploy` applies pending migrations on the next build.
- **Do not** commit `.env.local` or real API keys.
- **Usage costs:** `Run.estimatedCostUsd` uses DeepSeek v4 pricing defaults in `src/ai/pricing.ts`; update env overrides when DeepSeek changes rates.
- **Security tests:** run `npm test` before releases — includes budget, rate-limit, export authorization, and auth key suites under `src/test/security/`.

---

*Last updated: 2026-07-13 — Railway production deploy live.*
