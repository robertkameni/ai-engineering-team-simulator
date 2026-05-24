# AI Engineering Team Simulator

Multi-agent product debate simulator: describe an idea, watch a team debate it with streaming replies, persisted runs, and structured artifacts.

The simulator **auto-detects** whether your idea is a **software product**, a **physical / operational project** (construction, renovation, compliance), or **hybrid**, and adapts role titles, prompts, and artifact labels accordingly. Agents respond in the **same language** as your prompt (French, German, English, etc.).

**Default software pipeline:** PM → Architect → Backend → Frontend → Reviewer  
**Physical pipeline (same 5 slots, different roles):** Chef de projet travaux → Ingénieur technique → Expert conformité → Planning & budget → Reviewer

**Stack:** Next.js 16 (App Router), React 19, Tailwind 4, Prisma 7 + Neon, Vercel AI SDK + DeepSeek. Conventions live in [AGENTS.md](./AGENTS.md).

## Production

**Live app:** [https://ai-engineering-team-simulator.vercel.app](https://ai-engineering-team-simulator.vercel.app)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill DEEPSEEK_API_KEY + DATABASE_URL (Neon)
npm run db:migrate           # first time / after schema changes
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Recommended:** Lighthouse and perf checks on **`npm run build && npm run start`**, not `next dev`.

## How it works

1. Enter a product or project idea on `/` → `/workspace?prompt=...`
2. The server classifies the idea (`software` | `physical` | `hybrid`) and assembles the matching team
3. Five agents debate sequentially (short Slack-style turns, ~80–140 words)
4. During debate, agents may call tools (npm package lookup, technical norm search) — live activity pills appear on streaming messages
5. Artifacts synthesize after the debate (requirements/scope, architecture/technical, implementation/execution, review)
6. Run persists to Neon; sidebar lists recent history; `/runs/[id]` replays the saved debate
7. **Export** any run as Markdown from the header (Chrome/Edge: native Save As dialog; other browsers: direct download)

**Examples**

| Prompt type | Template | What you get |
|-------------|----------|--------------|
| SaaS HR scheduling app | `software` | PM scope, system design, backend/frontend plans, code-oriented review; architect verifies npm packages |
| School plumbing renovation | `physical` | Work package, technical/conformity planning, budget phasing — no software stack |
| DTU compliance app + BIM scope | `hybrid` | Software-oriented debate; backend slot uses compliance expert when physical keywords are detected |

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Generate Prisma client, migrate if `DATABASE_URL` is set, production Next build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:deploy` | `prisma migrate deploy` |

## Deploy

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel + Neon env vars, build/migrations, smoke test checklist.

## Docs

| File | Contents |
|------|----------|
| [MASTERPLAN.md](./MASTERPLAN.md) | Product roadmap and phase checklist |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel deployment |
| [AGENTS.md](./AGENTS.md) | Stack rules for contributors / AI agents |

---

*README last updated: 2026-05-24 — tool calling, hybrid routing, export (Save As), orchestration stability.*
