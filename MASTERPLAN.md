# AI Engineering Team Simulator — Master Plan

Living roadmap for the product, architecture, and implementation phases. Update this file when a phase ships or scope changes.

**Related docs:** [AGENTS.md](./AGENTS.md) (stack conventions for coding agents), [README.md](./README.md) (setup).

---

## Vision

A **multi-agent engineering simulator**: the user describes a product idea; AI teammates debate it in real time (requirements, architecture, implementation, review). Runs are **persisted**, **replayable** from the sidebar, and summarized as structured **artifacts** (requirements, architecture, implementation, review) in the right panel.

**Target experience:** Premium dark UI, streaming debate in the center, artifacts on the right (`lg+`), run history in the sidebar with delete.

---

## Tech stack (current)

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 App Router (`src/app`) |
| UI | React 19, Tailwind 4, shadcn-style components |
| AI | Vercel AI SDK 6, `@ai-sdk/deepseek`, `streamText`, `generateText` + `Output.object` |
| Models | DeepSeek v4 — [API docs](https://api-docs.deepseek.com) |
| Database | Prisma 7 + `prisma.config.ts` + `@prisma/adapter-neon` (Neon Postgres) |
| Deploy target | Vercel (not wired yet) |

### Agent pipeline (per run)

Order: **PM → Architect → Backend Developer → Frontend Developer → Reviewer**

| Role | Model | Thinking | Max output tokens |
|------|--------|----------|-------------------|
| PM | `deepseek-v4-flash` | Off | 450 |
| Architect | `deepseek-v4-pro` | Off (chat only — visible stream) | 650 |
| Backend | `deepseek-v4-pro` | Off | 500 |
| Frontend | `deepseek-v4-flash` | Off | 500 |
| Reviewer | `deepseek-v4-flash` | Off | 450 |

Configured in `src/ai/agents/config.ts`. All agents use `DEEPSEEK_CHAT_OPTIONS` (`thinking: disabled`) so tokens go to visible debate text, not hidden reasoning.

**Debate style:** Short Slack-like turns (~80–140 words), no markdown tables — see `src/ai/prompts/shared.ts`. Full detail lives in post-debate artifacts.

**Team names:** Randomized per run via `createSimulationRoster()`; stored as `team-roster` artifact + `Message.agentName`.

**Resilience:** Empty agent stream → one retry with doubled token budget (`run-simulation.ts`).

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
- [x] Global `cursor-pointer` on buttons / tab triggers

---

## Phase 1 — Database

**Goal:** Persist projects, runs, messages, artifacts.

- [x] Prisma schema: `Project`, `Run`, `Message`, `Artifact`, `RunStatus`
- [x] Migrations + Neon `DATABASE_URL`
- [x] Prisma 7 + `prisma.config.ts` + Neon adapter
- [x] Generated client at `src/generated/prisma`
- [x] DB helpers: `src/lib/db/runs.ts`, `projects.ts`, `team-roster.ts`, `artifacts.ts`
- [x] `Message.agentName` for dynamic roster display
- [x] Cascade delete: run → messages + artifacts

---

## Phase 2 — UI shell

**Goal:** Product chrome without live AI.

- [x] Landing page (`/`) + prompt form
- [x] Workspace shell: sidebar, header, thread, composer, artifact panel
- [x] Agent message components, avatars, status pill
- [x] Empty workspace state (no mock debate in main thread)
- [x] App shell layout: sidebar | main | artifacts (`lg+`)

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
- [x] Shared transcript context (`build-messages.ts`, role prompts per agent)
- [x] SSE: `run_started`, `agent_start`, `text-delta`, `agent_end`, `artifacts_*`, `done`, `error`
- [x] `GET /api/runs` for sidebar recent list
- [x] `DELETE /api/runs/[id]` — delete run from sidebar
- [x] `/runs/[id]` loads messages + artifacts from DB
- [x] Navigate to run page when simulation completes
- [x] Scrollable message thread (flex + `min-h-0`, auto-scroll)
- [x] Dynamic team roster per run
- [x] DeepSeek v4 models
- [x] Concise debate prompts (not long PRD-style dumps)
- [x] Sidebar: full prompt titles (2-line clamp), per-run delete control
- [x] `SidebarRecentRuns` + `SidebarRunItem` components

**Demo flow (today):**

1. `/` → enter idea → `/workspace?prompt=...`
2. Watch 5 agents stream in order (short messages)
3. Artifact panel shows “Synthesizing…” then four tabs when ready
4. Land on `/runs/[id]` with persisted thread + artifacts
5. Sidebar lists recent runs; hover delete (×) to remove

---

## Phase 5 — Structured artifacts

**Goal:** Right panel shows real extracted deliverables, not mocks.

- [x] Zod schemas — requirements, architecture, implementation, review (`src/features/artifacts/schemas.ts`)
- [x] Generate after debate — one artifact type at a time (`generate-run-artifacts.ts`)
- [x] Structured output via `generateText` + `Output.object`; JSON fallback per type if schema fails
- [x] Section templates per tab (`artifact-templates.ts`)
- [x] Persist to `Artifact` table; `saveSingleArtifact` per type
- [x] `ArtifactPanel` — four tabs, card sections, normalized bullets (`format-artifact.ts`)
- [x] Tab UX — role-colored active state, press scale, content fade-in (`artifact-tab-styles.ts`, `globals.css`)
- [x] Responsive tabs — 4 columns in one row; 2×2 grid when panel container is narrow (`@container/artifact-panel`)
- [x] SSE `artifacts_start` / `artifacts_ready` / `artifacts_failed`
- [x] `GET /api/runs/[id]/artifacts`
- [x] Live workspace derives `generating` when debate ends before SSE

**Note:** Runs created before Phase 5 or failed generation show `unavailable` — start a new simulation to populate artifacts.

---

## Phase 6 — Polish

**Goal:** Production-quality UX and resilience.

- [ ] Parse reviewer quotes into `QuotedBlock` UI (component exists, not wired to parser)
- [ ] Copy / export run as Markdown (thread + artifacts)
- [ ] Regenerate artifacts for an existing run (API + UI)
- [ ] Loading skeletons for thread / artifact panel
- [ ] Broader mobile layout pass (artifact panel hidden below `lg`)
- [ ] Optional: architect reasoning preview (disabled intentionally — consumed token budget with no visible text)

**Done (partial phase):**

- [x] Simulation error banner + retry
- [x] Agent typing indicators + handoff labels
- [x] Auto-scroll message thread
- [x] Artifact generation reliability (sequential + JSON fallback)
- [x] Artifact panel visual feedback on tab click
- [x] Sidebar delete + improved title visibility
- [x] Prompt composer sync via `key` (no effect setState)
- [x] ESLint clean (`react-hooks/set-state-in-effect` addressed)

**Replay today:** `/runs/[id]` is read-only DB replay (no re-call to AI). Not a dedicated “replay mode” UX.

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
- [ ] E2E tests (Playwright) for critical path

---

## Key routes & APIs

| Path | Method | Purpose |
|------|--------|---------|
| `/` | — | Landing + prompt |
| `/workspace` | — | Live simulation (`?prompt=`) or empty workspace |
| `/runs/[id]` | — | Persisted run (thread + artifacts) |
| `/api/simulate` | POST | Multi-agent SSE stream |
| `/api/runs` | GET | Recent runs for sidebar |
| `/api/runs/[id]` | DELETE | Delete run and related rows |
| `/api/runs/[id]/artifacts` | GET | Artifact bundle for a run |

---

## Key source layout

```
src/
  app/                    # Routes, API handlers
  ai/
    agents/               # config, roster
    artifacts/            # generate-run-artifacts, templates, transcript
    orchestration/        # run-simulation.ts
    prompts/              # per-role system + turn prompts
  features/
    artifacts/            # panel, schemas, tab styles
    simulation/           # stream hook, thread, composer
    workspace/            # shell, sidebar, run/simulation views
  lib/db/                 # Prisma helpers
```

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

After Prisma schema changes: run `npm run db:generate` and **restart** `npm run dev` (stale client cache — see `PRISMA_CLIENT_EPOCH` in `src/lib/prisma.ts`).

---

## Suggested implementation order

```
Finish Phase 6 (export, regenerate artifacts, skeletons) → Phase 7 (deploy) → Phase 8 (auth, if needed)
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-20 | Master plan created; Phases 0–4 complete; 5-agent roster + DeepSeek v4 |
| 2026-05-20 | `Message.agentName`, dynamic roster, scroll layout fix |
| 2026-05-20 | Phase 5: structured artifacts, SSE + API + live panel |
| 2026-05-20 | Phase 6 (partial): concise prompts, artifact UX, sidebar delete, tab effects, ESLint fixes |
| 2026-05-20 | Architect uses chat-only stream; sequential artifact gen + JSON fallback; `DELETE /api/runs/[id]` |

---

*Last updated: May 2026*
