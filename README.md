# AI Engineering Team Simulator

Multi-agent product debate simulator: describe an idea, watch PM → Architect → Backend → Frontend → Reviewer discuss it with streaming replies, persisted runs, and structured artifacts (requirements, architecture, implementation, review).

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

## Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Generate Prisma client, migrate if `DATABASE_URL` is set, production Next build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:deploy` | `prisma migrate deploy` |

## Deploy (Phase 7)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Vercel + Neon env vars, build/migrations, smoke test checklist.

## Docs

| File | Contents |
|------|----------|
| [MASTERPLAN.md](./MASTERPLAN.md) | Product roadmap and phase checklist |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Vercel deployment |
| [AGENTS.md](./AGENTS.md) | Stack rules for contributors / AI agents |

---

*README last aligned with MASTERPLAN: Phase 7 production URL.*
