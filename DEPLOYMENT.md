# Deploy to Vercel

This app is a **Next.js 16** App Router project with **long-running** API routes (`/api/simulate`, artifact regeneration), **auth sessions**, and **Upstash rate limits**. Use this checklist for a first production or preview deploy.

**Production URL:** [https://ai-engineering-team-simulator.vercel.app](https://ai-engineering-team-simulator.vercel.app)

## 1. Prerequisites

- GitHub (or GitLab / Bitbucket) repo connected to Vercel.
- A **Neon** Postgres database (recommended: install the [Neon Vercel integration](https://vercel.com/marketplace/neon); it wires `DATABASE_URL` for Preview and Production).
- A **DeepSeek** API key for `DEEPSEEK_API_KEY`.
- An **Upstash Redis** database for rate limiting (Marketplace → Upstash, or create at [upstash.com](https://upstash.com)).
- A strong **`AUTH_SECRET`** for JWT session signing (e.g. `openssl rand -base64 32`).

## 2. Environment variables

In the Vercel project → **Settings → Environment Variables**, configure at least:

| Variable | Production | Preview | Notes |
|----------|------------|---------|--------|
| `DATABASE_URL` | ✓ | ✓ | Pooled Postgres URL from Neon (integration sets this). |
| `DEEPSEEK_API_KEY` | ✓ | ✓ | Simulations and artifact generation. |
| `AUTH_SECRET` | ✓ | ✓ | **Required in production** — JWT session signing (`src/lib/auth/auth-session.ts`). |
| `UPSTASH_REDIS_REST_URL` | ✓ | ✓ | Rate limiting for `/api/simulate` and delete. |
| `UPSTASH_REDIS_REST_TOKEN` | ✓ | ✓ | Pair with URL above. |

Optional:

| Variable | Notes |
|---------|-------|
| `DIRECT_URL` | Non-pooled Neon URL for `prisma migrate deploy` (advisory locks). Resolved automatically when set; see `scripts/resolve-migrate-database-url.mjs`. |
| `RATE_LIMIT_SIMULATE_GUEST` | Default `3` simulations per hour per IP (guest). |
| `RATE_LIMIT_SIMULATE_AUTH` | Default `30` simulations per hour per signed-in user. |
| `RATE_LIMIT_DELETE` | Default `30` deletes per hour. |
| `RATE_LIMIT_DISABLED` | Set `true` to bypass limits (not recommended in production). |
| `DEEPSEEK_*_USD_PER_M` | Override model pricing for usage/cost estimates — see [.env.example](.env.example). |

Pull locally for parity:

```bash
npx vercel env pull .env.local
```

See [.env.example](.env.example) for a full local template.

## 3. Build command

Default **Build Command** is `npm run build`, which runs:

1. `prisma generate`
2. `prisma migrate deploy` — **only when `DATABASE_URL` is defined** at build time (uses `DIRECT_URL` when set for Neon advisory locks)
3. `next build`

If `DATABASE_URL` is missing during build (e.g. CI), migrations are skipped with a warning; **Vercel production/preview builds must have `DATABASE_URL`** so migrations apply before the app boots.

Alternatively run migrations from a Neon GitHub Action or manual job; keeping them in the Vercel build is the simplest path for this repo.

## 4. Function duration (multi-agent runs)

These routes set `maxDuration = 300` (5 minutes):

- `src/app/api/simulate/route.ts`
- `src/app/api/runs/[id]/artifacts/route.ts`

**Plan limits:** On Vercel, maximum duration depends on your plan (Hobby vs Pro vs Enterprise). If builds or requests time out, shorten the simulation in code or upgrade the plan. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

Six agents + artifact synthesis can approach the 300s ceiling on long debates — monitor function logs.

## 5. First deploy

1. **Import** the repository in Vercel.
2. **Add Neon** (Marketplace → Neon) and link the project, or paste `DATABASE_URL` manually for Production and Preview.
3. Add **`DIRECT_URL`** if Neon provides a separate non-pooled connection string (recommended for reliable migrations).
4. Add `DEEPSEEK_API_KEY`, `AUTH_SECRET`, and Upstash Redis vars for both environments.
5. Deploy. Watch the build log for `prisma migrate deploy` succeeding.

### Bootstrap admin user (optional)

After the first deploy with a working `DATABASE_URL`:

```bash
DATABASE_URL=... ADMIN_INITIAL_PASSWORD=... npx tsx scripts/create-admin-user.ts
```

Creates `admin@ai-team-simulation.dev` if it does not exist. Store the password securely.

## 6. Smoke test (preview or production)

After deploy:

1. Open `/` — landing loads (animated hero + footer).
2. Submit a short prompt — six agents stream, usage pill appears in header, redirect to `/runs/[id]`.
3. Open `/runs/[id]` — thread, artifacts, and token/cost badge appear.
4. Sidebar lists the run under your guest session (or signed-in account).
5. **Export** — guests are prompted to sign in; register/login, then export succeeds.
6. **Delete** — remove a run from the sidebar; foreign runs return `403`.
7. **Rate limit** — repeated simulate calls eventually return `429` (if Upstash is configured).

If streaming fails with 5xx, check Vercel **Functions** logs and confirm `DEEPSEEK_API_KEY`, `DATABASE_URL`, and `AUTH_SECRET` are set for the deployment environment you are hitting.

If simulate returns `503` with a rate-limit message, confirm Upstash env vars are present.

## 7. Ongoing operations

- **Schema changes:** commit a new Prisma migration under `prisma/migrations/`, then deploy; `migrate deploy` applies pending migrations on the next build.
- **Do not** commit `.env.local` or real API keys.
- **Usage costs:** `Run.estimatedCostUsd` uses DeepSeek v4 pricing defaults in `src/ai/pricing.ts`; update env overrides when DeepSeek changes rates.

---

*See [MASTERPLAN.md](MASTERPLAN.md) for roadmap context (Phases 7–9).*

*Last updated: 2026-05-25*
