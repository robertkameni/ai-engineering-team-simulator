# AI Engineering Team Simulator

Multi-agent product debate simulator: describe an idea, watch a team debate it with streaming replies, persisted runs, and structured artifacts.

The simulator **auto-detects** whether your idea is a **software product**, a **physical / operational project** (construction, renovation, compliance), or **hybrid**, and adapts role titles, prompts, and artifact labels accordingly. Agents respond in the **detected language** of your prompt (English, French, or Chinese — Latin-script prompts default to English to avoid model drift).

**Default software pipeline (6 agents):** PM → Architect → Backend → Frontend → **DevOps** → Reviewer  
**Physical pipeline (same 6 slots, different roles):** Chef de projet travaux → Ingénieur technique → Expert conformité → Planning & budget → **Exploitation & déploiement chantier** → Reviewer

**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Prisma 7 + Neon, Vercel AI SDK + DeepSeek, Upstash Redis (rate limits). Conventions live in [AGENTS.md](./AGENTS.md).

## Production

**Live:** [ai-engineering-team-simulator.up.railway.app](https://ai-engineering-team-simulator.up.railway.app) — see [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill DEEPSEEK_API_KEY + DATABASE_URL (Neon)
npm run db:migrate           # first time / after schema changes
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

**Optional env** (see [.env.example](./.env.example)): `AUTH_SECRET` (JWT sessions in production), `DIRECT_URL` (Neon migrations), Upstash Redis for rate limits, `SIMULATION_MAX_COST_USD` (per-run cost ceiling, default $0.75), `RATE_LIMIT_ENABLED_IN_DEV=true` to test throttling locally.

- **Recommended:** Lighthouse and perf checks on **`npm run build && npm run start`**, not `next dev`.

## How it works

1. Enter a product or project idea on `/` (animated landing with rotating examples) → `/workspace?prompt=...`
2. The server classifies the idea (`software` | `physical` | `hybrid`) and assembles the matching team
3. **Six agents** debate sequentially (dense technical prose — roughly 400-700 words, with mandatory cross-critique of prior teammates' designs)
4. During debate, agents may call tools (npm package lookup, technical norm search) — live activity pills appear on streaming messages
5. Artifacts synthesize after the debate (requirements/scope, architecture/technical, implementation/execution, blueprint/build-ready details, review)
6. Run persists to Neon with **token usage and estimated cost**; sidebar lists your recent history; `/runs/[id]` replays the saved debate
7. **Export** as **Markdown or PDF** from the header — **sign in required** (modal for guests); Markdown is generated client-side; PDF is generated server-side (Puppeteer) with agent accent colors and debate outcome summary; Chrome/Edge uses the native Save As dialog, other browsers fall back to a blob download

## Sessions & auth

- **Guest mode (default):** a cookie-scoped session owns your runs; sidebar and delete are scoped to that browser session. A **Public session** badge appears in the header.
- **Sign in / register:** email + password (JWT session cookie). Guest runs are **claimed** to your account on login/register (`POST /api/auth/claim-guest-runs`). Duplicate registration returns the same generic error as a failed login (no email enumeration).
- **Rate limits** (production, Upstash Redis): throttled per IP (guests) or per user (signed in). Disabled in local dev unless `RATE_LIMIT_ENABLED_IN_DEV=true`.

| Action | Default limit (guest / signed-in) |
|--------|-----------------------------------|
| Simulate | 3 / 30 per hour |
| Regenerate artifacts (API + UI action) | 3 / 10 per hour |
| Export PDF / Markdown | 5 / 5 per hour |
| Delete run | 30 / 30 per hour |
| Login / register | 10 per 15 min per IP + email hash |

- **Cost ceiling:** each run shares one budget (`SIMULATION_MAX_COST_USD`, default **$0.75**) across classification, debate, artifact synthesis, and regeneration. If the budget is exhausted during artifacts, debate messages are kept, artifacts may show as failed, and the live stream still completes with `done`.

**Examples**

| Prompt type | Template | What you get |
|-------------|----------|--------------|
| SaaS HR scheduling app | `software` | PM scope, system design, backend/frontend plans, blueprint with deps/schema/interfaces, code-oriented review; architect verifies npm packages |
| School plumbing renovation | `physical` | Work package, technical/conformity planning, budget phasing — no software stack |
| DTU compliance app + BIM scope | `hybrid` | Software-oriented debate; backend slot uses compliance expert when physical keywords are detected |

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Generate Prisma client, migrate if `DATABASE_URL` is set, production Next build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm test` | Security and unit tests (`src/test/**/*.test.ts`) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:deploy` | `prisma migrate deploy` |

## Deploy

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Railway + Neon env vars, build/migrations, smoke test checklist.

## Docs

| File | Contents |
|------|----------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Railway deployment |
| [AGENTS.md](./AGENTS.md) | Stack rules for contributors / AI agents |

---

*README last updated: 2026-07-13 — Railway production deploy live.*
