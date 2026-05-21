# AI Engineering Team Simulator — Master Plan

Living roadmap for the product, architecture, and implementation phases. Update this file when a phase ships or scope changes.

**Related docs:** [AGENTS.md](./AGENTS.md) (stack conventions for coding agents), [README.md](./README.md) (setup).

---

## Vision

A **multi-agent engineering simulator**: the user describes a product idea; AI teammates debate it in real time (requirements, architecture, implementation, review). Runs are **persisted**, **replayable** from the sidebar, and summarized as structured **artifacts** (requirements, architecture, implementation, review) in the right panel.

**Target experience:** Premium dark UI, streaming debate in the center, artifacts on the right (`960px+`), run history in the sidebar with delete. On mobile: menu drawer for history, floating **+** for new simulations, artifacts in a bottom sheet.

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
| [6](#phase-6--polish) | Polish & UX (+ SSR/perf paths) | **Done** |
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
- [x] Responsive tabs — wide panel: four columns in one row; narrow artifact panel: **2×2 grid** (`@container/artifact-panel`, `@min-[480px]/artifact-panel`)
- [x] SSE `artifacts_start` / `artifacts_ready` / `artifacts_failed`
- [x] `GET /api/runs/[id]/artifacts`
- [x] Live workspace derives `generating` when debate ends before SSE

**Note:** Runs created before Phase 5 or failed generation show `unavailable` — start a new simulation to populate artifacts.

---

## Phase 6 — Polish

**Goal:** Production-quality UX, glass design system, and resilience.

- [x] **Glass design system** — `glass-panel`, `glass-card`, `glass-input`, ambient mesh background (`globals.css`)
- [x] **Fluid typography** — container-query-based `--text-display/title/body/caption`
- [x] **Animations** — message enter, artifact tab fade, shimmer skeletons, pulse-glow indicators
- [x] **Container-query layout** — `@container/app-shell`: sidebar at `720px`, artifacts side panel at `960px`
- [x] **Mobile workspace** — sidebar drawer (header menu), FAB **+** opens prompt sheet, artifacts bottom sheet (header layers icon); inline artifact panel hidden below `960px`
- [x] **Mobile density** — compact header, icon-only export/status, tighter messages, thread padding for FAB
- [x] **Artifact tabs (mobile)** — 2×2 grid, auto height, `gap-4`, bottom spacing on tab wrapper
- [x] **Sheet UI** — `src/components/ui/sheet.tsx` (Radix Dialog) for mobile drawers; accessible `SheetTitle` on all sheets
- [x] **Hydration stability** — `suppressHydrationWarning` on textarea; stable `formatMessageTime()` (`de-DE`, UTC) for SSR/client parity
- [x] **Parse reviewer quotes** → `QuotedBlock` UI (`parse-message-blocks.ts`)
- [x] **Export run as Markdown** — header button + `downloadRunMarkdown()` (`lib/export/run-markdown.ts`)
- [x] **Loading skeletons** — message thread + artifact panel while bootstrapping / generating
- [x] **Regenerate artifacts** — `POST /api/runs/[id]/artifacts` re-synthesizes from saved debate; UI in artifact panel header + unavailable placeholder

**Also done (earlier partial work):**

- [x] Simulation error banner + retry
- [x] Agent typing indicators + handoff labels
- [x] Auto-scroll message thread
- [x] Artifact tab visual feedback (role colors, press scale)
- [x] Sidebar delete + improved title visibility
- [x] ESLint clean

**Replay today:** `/runs/[id]` replays the saved debate from DB; artifacts can be **regenerated** without re-running agents.

### Phase 6+ — SSR, performance paths, and UX follow-ups *(shipped incrementally)*

These build on Phase 6; they reduce client JS on **saved-run** replay and tighten Core Web Vitals when measured on a **production** build.

- [x] **Server-rendered `/runs/[id]`** — async server page fetches run + sidebar list; **`SavedRunWorkspace`** replaces heavy client workspace shell for persisted runs (`src/app/runs/[id]/page.tsx`, `src/features/workspace/saved-run-workspace.tsx`).
- [x] **Static message thread for saved runs** — `MessageThreadStatic` — server HTML, native scroll, optional skip of Radix-heavy paths for replay.
- [x] **Sidebar SSR on saved runs** — `listRecentRunsForSidebar()` + `SidebarStatic` / `SidebarContentStatic`; relative time labels aligned with SSR (`formatRelativeTime`).
- [x] **Delete from static sidebar** — `deleteRunAction` server action (revalidate + redirect when deleting the open run).
- [x] **Regenerate artifacts (saved-run path)** — `regenerateRunArtifactsAction` + form/`useFormStatus`; `revalidatePath` after success (`src/features/artifacts/regenerate-artifacts-action.ts`).
- [x] **`ArtifactPanelStatic`** — artifact tabs without Radix on desktop saved-run path (CSS radios + `:has()` / `globals.css`); native scroll inside panels; **`ArtifactSections`** shared with client `ArtifactPanel`.
- [x] **Tab bar layout fixes** — 2-column tab grid when the artifact panel is narrow, 4 columns when `@min-[480px]/artifact-panel`; wrap + `title` tooltips so long labels (e.g. Implementation) are readable without ellipsis-only UX.
- [x] **Thin scrollbars** — global WebKit/`scrollbar-*` tuning + slimmer Radix `ScrollArea` track (`globals.css`, `components/ui/scroll-area.tsx`).
- [x] **Live `/workspace`** — retains streaming client shell; **`PromptComposer`** code-split (`next/dynamic`); sidebar still uses **`ScrollArea`** where needed.

**Perf note:** Lighthouse and field metrics on `next dev` are **not representative** — always verify with `npm run build && npm start` before judging LCP/TBT.

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
| `/api/runs/[id]/artifacts` | POST | Regenerate artifacts from saved debate |
| _(Server Actions)_ | — | `regenerateRunArtifactsAction`, `deleteRunAction` — used on saved-run UI; invalidate via `revalidatePath` |

---

## Key source layout

```
src/
  app/                    # Routes, API handlers (`runs/[id]` server component for replay)
  ai/
    agents/               # config, roster
    artifacts/            # generate-run-artifacts, templates, transcript
    orchestration/        # run-simulation.ts
    prompts/              # per-role system + turn prompts
  features/
    artifacts/            # ArtifactPanel (+ static panel), schemas, sections, regenerate action
    simulation/           # stream hook, thread (client + static), composer (FAB + sheet)
    workspace/            # AppShell, SavedRunWorkspace, sidebar (client + static), mobile sheets
  lib/
    db/                   # Prisma helpers (incl. listRecentRunsForSidebar)
    export/               # run-markdown.ts
    format-time.ts        # stable SSR message timestamps + relative sidebar labels
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
Finish Phase 7 (deploy) → Phase 8 (auth, if needed)
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-22 | Phase 6+ documented: SSR saved-run workspace, static artifact panel + shared sections, sidebar SSR/static delete, regenerate server action, thin scrollbars; perf verification note (prod build). |
| 2026-05-20 | Master plan created; Phases 0–4 complete; 5-agent roster + DeepSeek v4 |
| 2026-05-20 | `Message.agentName`, dynamic roster, scroll layout fix |
| 2026-05-20 | Phase 5: structured artifacts, SSE + API + live panel |
| 2026-05-20 | Phase 6 (partial): glass design system, container-query layout, animations, quote parsing, Markdown export, skeletons |
| 2026-05-20 | Architect uses chat-only stream; sequential artifact gen + JSON fallback; `DELETE /api/runs/[id]` |
| 2026-05-19 | Mobile workspace: sidebar drawer, prompt FAB + sheet, artifacts sheet; hydration + `format-time.ts`; artifact tab mobile spacing |
| 2026-05-19 | Phase 6 complete: `POST /api/runs/[id]/artifacts` regenerate + artifact panel UI |

---

*Last updated: 2026-05-22*
