# Phase 7 — Deploy to Vercel

This app is a **Next.js 16** App Router project with **long-running** API routes (`/api/simulate`, artifact regeneration). Use this checklist for a first production or preview deploy.

**Production URL:** [https://ai-engineering-team-simulator.vercel.app](https://ai-engineering-team-simulator.vercel.app)

## 1. Prerequisites

- GitHub (or GitLab / Bitbucket) repo connected to Vercel.
- A **Neon** Postgres database (recommended: install the [Neon Vercel integration](https://vercel.com/marketplace/neon); it wires `DATABASE_URL` for Preview and Production).
- A **DeepSeek** API key for `DEEPSEEK_API_KEY`.

## 2. Environment variables

In the Vercel project → **Settings → Environment Variables**, configure at least:

| Variable | Production | Preview | Notes |
|----------|------------|---------|--------|
| `DATABASE_URL` | ✓ | ✓ | Pooled Postgres URL from Neon (integration sets this). |
| `DEEPSEEK_API_KEY` | ✓ | ✓ | Needed for simulations and artifact generation over the API. |

Optional for some Neon setups:

| Variable | Notes |
|---------|-------|
| `DIRECT_URL` | Non-pooled URL if you use Accelerate/split URLs; this repo uses `DATABASE_URL` in `prisma.config.ts`. Align with Neon’s Prisma+Vercel guide. |

Pull locally for parity:

```bash
npx vercel env pull .env.local
```

See [.env.example](.env.example) for a minimal local template.

## 3. Build command

Default **Build Command** is `npm run build`, which runs:

1. `prisma generate`
2. `prisma migrate deploy` — **only when `DATABASE_URL` is defined** at build time (after loading `.env` / `.env.local` locally, or from Vercel env on the builder)
3. `next build`

If `DATABASE_URL` is missing during build (e.g. CI), migrations are skipped with a warning; **Vercel production/preview builds must have `DATABASE_URL`** so migrations apply before the app boots.

Alternatively run migrations from a Neon GitHub Action or manual job; keeping them in the Vercel build is the simplest path for this repo.

## 4. Function duration (multi-agent runs)

These routes set `maxDuration = 300` (5 minutes):

- `src/app/api/simulate/route.ts`
- `src/app/api/runs/[id]/artifacts/route.ts`

**Plan limits:** On Vercel, maximum duration depends on your plan (Hobby vs Pro vs Enterprise). If builds or requests time out, shorten the simulation in code or upgrade the plan. See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## 5. First deploy

1. **Import** the repository in Vercel.
2. **Add Neon** (Marketplace → Neon) and link the project, or paste `DATABASE_URL` manually for Production and Preview.
3. Add `DEEPSEEK_API_KEY` for both environments.
4. Deploy. Watch the build log for `prisma migrate deploy` succeeding.

## 6. Smoke test (preview or production)

After deploy:

1. Open `/` — landing loads.
2. Submit a short prompt from `/workspace?prompt=…` or the landing form — stream completes and redirects to `/runs/[id]`.
3. Open `/runs/[id]` — thread and artifacts (or generating state) appear.
4. Sidebar recent runs lists the new run (if applicable to your layout).

If streaming fails with 5xx, check Vercel **Functions** logs and confirm `DEEPSEEK_API_KEY` and `DATABASE_URL` are set for the deployment environment you are hitting.

## 7. Ongoing operations

- **Schema changes:** commit a new Prisma migration under `prisma/migrations/`, then deploy; `migrate deploy` applies pending migrations on the next build.
- **Do not** commit `.env.local` or real API keys.

---

*See [MASTERPLAN.md](MASTERPLAN.md) Phase 7 for roadmap context.*
