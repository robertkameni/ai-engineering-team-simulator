# AI Engineering Team Simulator — Master Plan

Living roadmap for the product, architecture, and implementation phases. Update this file when a phase ships or scope changes.

**Related docs:** [AGENTS.md](./AGENTS.md) (stack conventions for coding agents), [README.md](./README.md) (setup).

---

## Vision

A **multi-agent engineering simulator**: the user describes a product idea; AI teammates debate it in real time (requirements, architecture, implementation, review). Runs are **persisted**, **replayable**, and eventually surfaced as structured **artifacts** (requirements, architecture, review).

**Target experience:** Premium dark UI, streaming debate in the center, artifacts on the right, run history in the sidebar.

---

## Tech stack (current)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (`src/app`) |
| UI | React 19, Tailwind 4, shadcn-style components |
| AI | Vercel AI SDK 6, `@ai-sdk/deepseek`, `streamText` |
| Models | DeepSeek v4 — [API docs](https://api-docs.deepseek.com) |
| Database | Prisma 7 + `prisma.config.ts` + `@prisma/adapter-neon` (Neon Postgres) |
| Deploy target | Vercel (not wired yet) |

### Agent pipeline (per run)

Order: **PM → Architect → Backend Developer → Frontend Developer → Reviewer**

| Role | Model | Thinking |
|------|--------|----------|
| PM | `deepseek-v4-flash` | Off |
| Architect | `deepseek-v4-pro` | On (`reasoningEffort: high`) |
| Backend | `deepseek-v4-pro` | Off |
| Frontend | `deepseek-v4-flash` | Off |
| Reviewer | `deepseek-v4-flash` | Off |

**Output token caps (tunable in `src/ai/agents/config.ts`):** PM 1600, Architect 2200, Backend/Frontend 1800, Reviewer 1600.

**Team names:** Randomized per run via `createSimulationRoster()`; stored as `team-roster` artifact + `Message.agentName`.

---

## Phase overview

| Phase | Focus | Status |
|-------|--------|--------|
| [0](#phase-0--foundation) | Foundation, tokens, structure | **Done** |
| [1](#phase-1--database) | Database & Prisma | **Done** |
| [2](#phase-2--ui-shell) | UI shell & static workspace | **Done** |
| [3](#phase-3--single-agent-streaming) | Single-agent streaming | **Done** (superseded by Phase 4) |
| [4](#phase-4--multi-agent--persistence) | Multi-agent + persistence | **Done** |
| [5](#phase-5--structured-artifacts) | Structured artifacts | **Done** |
| [6](#phase-6--polish) | Polish & UX | **Partial** |
| [7](#phase-7--deploy) | Deploy to Vercel | **Not started** |
| [8](#phase-8--auth-optional) | Auth (optional) | **Not started** |
| [9](#phase-9--stretch) | Stretch goals | **Not started** |

---

## Phase 0 — Foundation

**Goal:** Repo structure, design system, dependencies.

- [x] Next.js 16 + React 19 + Tailwind 4
- [x] Dark-first design tokens (`src/app/globals.css`)
- [x] shadcn-style UI primitives (`src/components/ui/`)
- [x] `src/` layout: `app`, `features`, `ai`, `lib`
- [x] Agent accent colors per role

---

## Phase 1 — Database

**Goal:** Persist projects, runs, messages, artifacts.

- [x] Prisma schema: `Project`, `Run`, `Message`, `Artifact`, `RunStatus`
- [x] Migrations + Neon `DATABASE_URL`
- [x] Prisma 7 + `prisma.config.ts` + Neon adapter
- [x] Generated client at `src/generated/prisma`
- [x] DB helpers: `src/lib/db/runs.ts`, `projects.ts`, `team-roster.ts`
- [x] `Message.agentName` for dynamic roster display

---

## Phase 2 — UI shell

**Goal:** Product chrome without live AI.

- [x] Landing page (`/`) + prompt form
- [x] Workspace shell: sidebar, header, thread, composer, artifact panel
- [x] Agent message components, avatars, status pill
- [x] Empty workspace state (no mock debate in main thread)

---

## Phase 3 — Single-agent streaming

**Goal:** Prove DeepSeek + SSE streaming.

- [x] `POST /api/simulate` with SSE events
- [x] PM-only stream (replaced by full team in Phase 4)
- [x] Client hook: `use-simulation-stream.ts`

---

## Phase 4 — Multi-agent + persistence

**Goal:** Full team debate, save to DB, browse runs.

- [x] Sequential orchestration (`src/ai/orchestration/run-simulation.ts`)
- [x] Shared transcript context (`build-messages.ts`, role prompts)
- [x] SSE: `run_started`, `agent_start`, `text-delta`, `agent_end`, `done`, `error`
- [x] `GET /api/runs` for sidebar
- [x] `/runs/[id]` loads messages from DB
- [x] Navigate to run page when simulation completes
- [x] Scrollable message thread (flex + `min-h-0` layout)
- [x] Dynamic team roster per run
- [x] DeepSeek v4 + mixed reasoning on architect

**Demo flow (today):**

1. `/` → enter idea → `/workspace?prompt=...`
2. Watch 5 agents stream in order
3. Land on `/runs/[id]` with persisted thread
4. Sidebar shows recent runs

---

## Phase 5 — Structured artifacts

**Goal:** Right panel shows real extracted deliverables, not mocks.

- [x] Define artifact schemas (requirements, architecture, implementation, review) — Zod in `src/features/artifacts/schemas.ts`
- [x] Generate with `generateText` + `Output.object` (AI SDK v6) after debate — `src/ai/artifacts/generate-run-artifacts.ts`
- [x] Persist to `Artifact` table (`type` + JSON `data`)
- [x] Wire `ArtifactPanel` to run data (4 tabs incl. Implementation)
- [x] SSE `artifacts_start` / `artifacts_ready` / `artifacts_failed` + `GET /api/runs/[id]/artifacts`

**Files to touch:** `src/features/artifacts/`, `src/ai/orchestration/`, `src/lib/db/artifacts.ts`

---

## Phase 6 — Polish

**Goal:** Production-quality UX and resilience.

- [ ] Parse reviewer quotes into `QuotedBlock` UI
- [ ] Show architect “thinking” state (optional reasoning preview)
- [ ] Copy / export run as Markdown
- [ ] Replay mode (read-only, no re-fetch AI)
- [ ] Better error messages (surface API/DB errors cleanly)
- [ ] Loading skeletons, empty states, mobile layout pass
- [ ] Optional: continue truncated turns if `maxOutputTokens` hit

**Partially done:** error banner, typing indicators, auto-scroll thread.

---

## Phase 7 — Deploy

**Goal:** Public preview on Vercel.

- [ ] Link Vercel project + Neon integration
- [ ] Env: `DEEPSEEK_API_KEY`, `DATABASE_URL` (preview + production)
- [ ] `maxDuration` on `/api/simulate` (currently 300s) — confirm plan limits
- [ ] `prisma migrate deploy` in CI or build step
- [ ] Smoke test preview URL end-to-end

---

## Phase 8 — Auth (optional)

**Goal:** Per-user runs and private history.

- [ ] Auth provider (Clerk / Auth0 / NextAuth — TBD)
- [ ] `User` model + `Run.userId`
- [ ] Protect API routes and run pages

---

## Phase 9 — Stretch

**Goal:** Differentiation and depth.

- [ ] DevOps agent in pipeline
- [ ] User-selectable team size / agents
- [ ] Share run via public link
- [ ] Cost / token usage display per run
- [ ] Premium UI motion (from UI design plan)
- [ ] E2E tests (Playwright) for critical path

---

## Key routes & APIs

| Path | Purpose |
|------|---------|
| `/` | Landing + prompt |
| `/workspace` | Empty workspace or `?prompt=` live simulation |
| `/runs/[id]` | Persisted run detail |
| `POST /api/simulate` | Start multi-agent SSE stream |
| `GET /api/runs` | Recent runs for sidebar |

---

## Environment

```env
# .env.local (repo root)
DEEPSEEK_API_KEY=
DATABASE_URL=          # Neon pooled URL
# DIRECT_URL=          # optional, for migrations
```

```bash
npm install
npm run db:migrate      # first time / after schema changes
npm run dev
```

After Prisma schema changes: run `npm run db:generate` and **restart** `npm run dev` (stale client cache).

---

## Suggested implementation order

```
Phase 5 (artifacts) → Phase 6 (polish) → Phase 7 (deploy) → Phase 8 (auth, if needed)
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Master plan document created; Phases 0–4 marked complete; 5-agent roster + v4 models documented |
| 2026-05-20 | Added `Message.agentName`, dynamic roster, scroll layout fix |
| 2026-05-20 | Phase 5: structured artifacts via `generateText` + `Output.object`, live panel + API |

---

*Last updated: May 2026*
