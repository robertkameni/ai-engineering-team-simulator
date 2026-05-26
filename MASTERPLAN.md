# AI Engineering Team Simulator — Master Plan

Living roadmap for the product, architecture, and implementation phases. Update this file when a phase ships or scope changes.

**Related docs:** [AGENTS.md](./AGENTS.md) (stack conventions for coding agents), [README.md](./README.md) (setup), [DEPLOYMENT.md](./DEPLOYMENT.md) (Vercel).

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
| Deploy target | Vercel — [Production](https://ai-engineering-team-simulator.vercel.app) · [DEPLOYMENT.md](./DEPLOYMENT.md) |

### Agent pipeline (per run)

Order (fixed slots): **PM → Architect → Backend → Frontend → DevOps → Reviewer**

| Role | Model | Thinking | Max output tokens (debate turn) |
|------|--------|----------|----------------------------------|
| PM | `deepseek-v4-flash` | Off | 600 |
| Architect | `deepseek-v4-pro` | **Low** (`DEEPSEEK_REASONING_OPTIONS`) | 650 |
| Backend | `deepseek-v4-pro` | Off | 600 |
| Frontend | `deepseek-v4-flash` | Off | 500 |
| DevOps | `deepseek-v4-flash` | Off | 550 |
| Reviewer | `deepseek-v4-flash` | Off | 600 |

Configured in `src/ai/agents/config.ts` (base caps). **Debate turns** override via `getTurnMaxOutputTokens()` in `run-simulation.ts`. PM, backend, frontend, and reviewer use `DEEPSEEK_CHAT_OPTIONS` (`thinking: disabled`). Architect uses low-effort reasoning for deeper technical turns without long hidden waits.

**Debate style:** Short Slack-like turns (~80–140 words), semantic section headings (no hardcoded English titles), no markdown tables — see `src/ai/prompts/shared.ts`. Full detail lives in post-debate artifacts.

**Language:** Agents and artifacts match the product idea’s language via heuristic detection (`detect-product-language.ts`: English, French, Chinese; Latin-script defaults to English). Directives in `build-messages.ts` and `ARTIFACT_LANGUAGE_DIRECTIVE` in artifact synthesis.

**Team names:** Randomized per run via `createSimulationRoster(templateId)`; stored as `team-roster` artifact (includes `templateId`) + `Message.agentName`.

**Resilience (`run-simulation.ts`):**
- Empty agent stream → fallback to `result.text` (reasoning models may not emit `textStream` deltas)
- Still empty → one retry on `deepseek-v4-flash` with chat options (no reasoning) and doubled token budget
- Stream errors logged via `onError`
- Reviewer decision parsed from **raw** stream text before `normalizeAgentPersistedText` strips `[APPROVE]` / `[REJECT: role]` tags
- Artifact synthesis runs in `/api/simulate` **before** the `done` SSE (avoids client polling 404s during generation)

### Tool calling *(2026-05-24)*

Agents can invoke tools during debate turns (`streamText` + `agentTools`, max 3 steps per turn).

| Tool | Used by | Purpose |
|------|---------|---------|
| `check_npm_package` | Architect (software prompts) | Verify npm package name + latest version before recommending a stack |
| `search_technical_norm` | Compliance expert (physical / hybrid backend) | Look up DTU, ERP, fire-safety norms |

- Registry: `src/ai/tools/registry.ts`
- SSE: `tool_start` (name + args), `tool_end` — shapes in `src/lib/simulation-stream.ts`
- UI: live pills on streaming messages (`tool-activity-label.ts`, French labels; `activeTools` on `SimulationMessage`)
- Stream cleanup: `src/ai/orchestration/agent-stream-text.ts` strips meta-commentary (“Let me check…”), inline tool narration, and normalizes glued `##` headings before display/persist

### Dynamic team templates *(2026-05-24)*

Before debate, `classifyProjectTeamTemplate()` picks a template from the prompt — no need to write “sans logiciel” explicitly. **Keyword pre-check:** if both software and physical keywords appear in the prompt, template is forced to `hybrid` before the LLM call.

| Template | When | Slot titles (examples) | Prompts |
|----------|------|------------------------|---------|
| `software` | Apps, SaaS, APIs, dashboards | Product Manager, Architect, Backend/Frontend Developer | `src/ai/prompts/*.ts` |
| `physical` | Construction, renovation, compliance, field work | Chef de projet travaux, Ingénieur technique, Expert conformité, Planning budget & risques | `src/ai/prompts/physical/*.ts` |
| `hybrid` | Physical scope + software component | Mixed titles | Software prompts; **backend slot** uses physical compliance expert when physical keywords are present |

- Config: `src/ai/agents/team-templates.ts`
- Classification: `src/ai/orchestration/classify-project.ts` (keyword + LLM; hybrid keyword override)
- Routing: `src/ai/prompts/index.ts` (`getAgentSystemPrompt` / `getAgentTurnPrompt`; hybrid backend → compliance expert when `hasPhysicalKeywords(productIdea)`)
- Artifact guidelines per template: `src/ai/artifacts/artifact-templates.ts` (software tabs: Requirements…; physical: Scope, Technical, Execution, Review)
- SSE `team_ready` sends full roster (names + titles) immediately after classification so the UI shows correct role labels before agents speak

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
| [7](#phase-7--deploy) | Deploy to Vercel | **Done** — [Production](https://ai-engineering-team-simulator.vercel.app) |
| [8](#phase-8--auth-optional) | Auth + run ownership | **Mostly done** — custom JWT auth, guest sessions, scoped sidebar/delete |
| [9](#phase-9--stretch) | Stretch goals | **Partial** — DevOps agent + usage/cost shipped |

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
- [x] SSE: `run_started`, `team_ready`, `agent_start`, `text-delta`, `tool_start`, `tool_end`, `agent_end`, `artifacts_start`, `done`, `error`
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
2. Watch 6 agents stream in order (short messages)
3. Artifact panel shows “Synthesizing…” then four tabs when ready
4. Land on `/runs/[id]` with persisted thread + artifacts + usage pill
5. Sidebar lists your recent runs (guest session or signed-in user); hover delete (×) to remove

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
- [x] SSE `artifacts_start`; client polls `GET /api/runs/[id]/artifacts` after `done` (synthesis completes server-side before `done` is sent)
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
- [x] **Export run as Markdown** — header button + `exportRunMarkdown()` (`lib/export/run-markdown.ts`): client-side markdown from run data; Chrome/Edge uses native **Save As** (`showSaveFilePicker`); other browsers fall back to blob download. Optional direct download: `GET /api/runs/[id]/export`
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
- [x] **`PromptComposer`** code-split (`next/dynamic`); sidebar still uses **`ScrollArea`** where needed.

### Phase 6++ — Adaptive teams, localization, and UX *(shipped 2026-05-24)*

- [x] **Project classification** — `classify-project.ts` picks `software` | `physical` | `hybrid` before debate.
- [x] **Team templates** — `team-templates.ts`; five fixed slots with dynamic titles per template; `templateId` on roster artifact.
- [x] **Physical prompts** — `src/ai/prompts/physical/` (no software/API proposals; reviewer rejects software drift).
- [x] **Localized output** — language-matching directive on product idea; semantic section headings; artifact titles generated in transcript language.
- [x] **Template-aware artifacts** — `sectionGuidelinesForArtifact(templateId)` + physical focus strings in `generate-run-artifacts.ts`.
- [x] **Architect latency** — reasoning effort `low`; handoff indicator during empty streaming turns.
- [x] **Stream resilience** — `result.text` fallback + flash/chat retry when reasoning stream is empty.
- [x] **Sidebar SSR on `/workspace`** — `listRecentRunsForSidebar(12)` server-rendered; loading state in `SidebarRecentRuns` (no false “No runs yet” flash).
- [x] **`team_ready` SSE** — client shows correct role titles and artifact tab labels immediately after classification.
- [x] **Dynamic UI labels** — debate stepper, typing indicator, and artifact tabs use roster titles (not hardcoded “Backend Developer”).

**Not yet:** full dedicated `hybrid` prompt set (partial: compliance backend routing when physical keywords detected).

**Done (Phase 9):** DevOps agent as 6th pipeline slot *(2026-05-25)*.

### Phase 6+++ — Tool calling, orchestration stability, export *(shipped 2026-05-24)*

- [x] **Agent tools** — `check_npm_package`, `search_technical_norm`; `fullStream` loop emits `tool_start` / `tool_end` SSE; live UI badges (French labels).
- [x] **Stream text normalization** — `agent-stream-text.ts`: strip meta-commentary and tool narration, architect preamble buffer, markdown heading fix, separate stream vs persist text.
- [x] **Debate token tuning** — role-aware `getTurnMaxOutputTokens()` (PM/reviewer/backend 600, architect 650, frontend 500, devops 550).
- [x] **Hybrid classification** — keyword pre-detection forces `hybrid`; backend slot routes to physical compliance expert when physical keywords present.
- [x] **Artifact timing** — `regenerateRunArtifacts()` awaited in `/api/simulate` before `done` SSE (removed fire-and-forget race).
- [x] **Reviewer fix** — parse `[APPROVE]` / `[REJECT]` from raw stream text before tag stripping.
- [x] **Export reliability** — `exportRunMarkdown()` with File System Access API + blob fallback; stable SSR (no `Date.now()` in initial `href`); `GET /api/runs/[id]/export` for direct links *(export requires sign-in since Phase 8)*.

**Perf note:** Lighthouse and field metrics on `next dev` are **not representative** — always verify with `npm run build && npm start` before judging LCP/TBT.

---

## Phase 7 — Deploy

**Goal:** Public preview on Vercel.

**Guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)

- [x] Link Vercel project + Neon integration *(follow [DEPLOYMENT.md](./DEPLOYMENT.md))* — Neon linked in Vercel; `DATABASE_URL` via integration / dashboard.
- [x] Env: `DEEPSEEK_API_KEY`, `DATABASE_URL` (preview + production) — set on Vercel for preview + production scopes.
- [x] **`maxDuration`** — `runtime = "nodejs"` and `maxDuration = 300` on `/api/simulate` and `POST /api/runs/[id]/artifacts`; align with [Vercel plan limits](https://vercel.com/docs/functions/limitations) *(upgrade if Hobby caps below 300s)*.
- [x] **`prisma migrate deploy`** — runs during `npm run build` when `DATABASE_URL` is set (`scripts/prisma-migrate-deploy-if-url.mjs`); skipped in CI/no-DB contexts with a warning.
- [x] Smoke test preview URL end-to-end — production exercised end-to-end after deploy (`https://ai-engineering-team-simulator.vercel.app`).

---

## Phase 8 — Auth + run ownership

**Goal:** Per-user runs, guest sessions, and scoped history.

- [x] `User` model + `Run.userId` + `Run.guestSessionId` (Prisma migrations)
- [x] Custom auth — email/password, `bcryptjs` hashing, JWT session cookie (`jose`) — `src/lib/auth/`, `POST /api/auth/login`, `register`, `logout`
- [x] Guest session cookie — runs scoped to browser until sign-in
- [x] Claim guest runs on login/register — `POST /api/auth/claim-guest-runs`
- [x] Ownership-scoped sidebar + run creation (`createRun` with `userId` / `guestSessionId`)
- [x] Ownership-checked delete — `deleteRunIfOwned`, `403` on foreign runs
- [x] Rate limiting — Upstash Redis on `POST /api/simulate` and `DELETE /api/runs/[id]` (`src/lib/rate-limit.ts`)
- [x] Export gated to signed-in users — client modal for guests; `GET /api/runs/[id]/export` returns `401` without session
- [x] UI — `AuthStatusBadge`, sign-out, export auth modal, header actions

**Not yet:**

- [ ] Ownership check on `/runs/[id]` page and `GET/POST /api/runs/[id]/artifacts` (run ID is still guessable if shared)
- [ ] Third-party auth provider (Clerk / Auth0) — custom JWT chosen instead
- [ ] Admin role surfaced in UI (`UserRole` migration exists; `scripts/create-admin-user.ts` for bootstrap)

---

## Phase 9 — Stretch

**Goal:** Differentiation and depth.

- [x] **DevOps agent in pipeline** — 6th slot; software + physical prompts (`devops.ts`, `physical/devops-site.ts`); roster backward-compat for 5-agent runs
- [x] **Cost / token usage display per run** — `RunUsageAccumulator`, `src/ai/pricing.ts`, persisted on `Run`; `RunUsagePill` in workspace header
- [ ] Dedicated hybrid prompts (physical + software in one debate — partial routing exists today)
- [ ] User-selectable team size / agents (templates are automatic today)
- [ ] Share run via public link
- [ ] E2E tests (Playwright) for critical path

### Phase 8+ / 9 — Post-launch increment *(shipped 2026-05-25)*

- [x] **6-agent pipeline** — DevOps between Frontend and Reviewer; updated reviewer reject tags and turn token caps
- [x] **Usage tracking** — accumulate prompt/completion tokens + estimated USD cost across debate + artifact synthesis; `setRunUsageTotals` before `done` SSE
- [x] **Language detection** — `detect-product-language.ts` (English / French / Chinese); explicit directives to reduce DeepSeek Chinese drift on Latin prompts
- [x] **Rate limits** — per-IP (guest) and per-user (auth) on simulate/delete; disabled in dev by default
- [x] **Landing refresh** — `LandingFloatingAgents`, `LandingHero`, rotating placeholders, staggered example chips; `SiteFooter`
- [x] **Prisma migrations on Neon** — `DIRECT_URL` / `resolve-migrate-database-url.mjs` for advisory locks; retry logic in `prisma-migrate-deploy-if-url.mjs`
- [x] **Export UX** — guests prompted to sign in before export; authenticated users export immediately

---

## Key routes & APIs

| Path | Method | Purpose |
|------|--------|---------|
| `/` | — | Landing + prompt |
| `/workspace` | — | Live simulation (`?prompt=`) or empty workspace |
| `/runs/[id]` | — | Persisted run (thread + artifacts) |
| `/api/simulate` | POST | Multi-agent SSE stream (ownership + rate limit) |
| `/api/runs` | GET | Recent runs for sidebar (scoped to guest session or user) |
| `/api/runs/[id]` | DELETE | Delete run if owned (403 otherwise) |
| `/api/runs/[id]/artifacts` | GET | Artifact bundle for a run |
| `/api/runs/[id]/artifacts` | POST | Regenerate artifacts from saved debate |
| `/api/runs/[id]/export` | GET | Download run as Markdown — **auth required** |
| `/api/auth/register` | POST | Create account + session |
| `/api/auth/login` | POST | Sign in + session |
| `/api/auth/logout` | POST | Clear session |
| `/api/auth/claim-guest-runs` | POST | Attach guest runs to signed-in user |
| _(Server Actions)_ | — | `regenerateRunArtifactsAction`, `deleteRunAction` — used on saved-run UI; invalidate via `revalidatePath` |

---

## Key source layout

```
src/
  app/                    # Routes, API handlers (`runs/[id]` server component for replay)
  ai/
    agents/               # config (6 slots), roster, team-templates.ts
    artifacts/            # generate-run-artifacts, templates (per templateId), transcript
    orchestration/        # run-simulation.ts, classify-project.ts, agent-stream-text.ts
    prompts/              # software + physical/ (+ devops-site); index routes by templateId
    tools/                # agentTools registry (npm, technical norms)
    context/              # build-messages.ts, detect-product-language.ts
    pricing.ts            # DeepSeek v4 USD estimates per model
  features/
    artifacts/            # ArtifactPanel (+ static), debate stepper, tab labels per template
    simulation/           # stream hook, tool-activity-label, run-usage-pill, typing indicator
    workspace/            # AppShell, auth badge, export auth modal, SavedRunWorkspace
    landing/              # LandingHero, floating agents, example prompts
  lib/
    auth/                 # JWT session, guest cookie, run ownership, claim-guest-runs
    ai/                   # run-usage accumulator + totals types
    db/                   # Prisma helpers (ownership-scoped listRecentRuns)
    export/               # run-markdown.ts
    rate-limit.ts         # Upstash simulate/delete limits
    format-time.ts        # stable SSR message timestamps + relative sidebar labels
```

---

## Environment

```env
# .env.local (repo root)
DEEPSEEK_API_KEY=
DATABASE_URL=          # Neon pooled URL
# DIRECT_URL=          # optional, non-pooled URL for migrations (Neon advisory locks)
AUTH_SECRET=           # required in production (JWT session signing)
# UPSTASH_REDIS_REST_URL= / UPSTASH_REDIS_REST_TOKEN=  # rate limits in production
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
Finish Phase 8 ownership gaps (runs/[id] + artifacts API) → Phase 9 remainder (share links, hybrid prompts, E2E), or iterate on UX/perf post-launch.
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-05-25 | **Auth + ownership:** `User` model, JWT sessions (`jose` + `bcryptjs`), guest sessions, claim-guest-runs, ownership-scoped sidebar/delete/simulate, export auth modal + API 401, `AuthStatusBadge`, sign-out. |
| 2026-05-25 | **DevOps + usage:** 6th pipeline slot (DevOps); `RunUsageAccumulator` + `pricing.ts`; token/cost fields on `Run`; `RunUsagePill` in header. |
| 2026-05-25 | **Rate limits + infra:** Upstash Redis on simulate/delete; `DIRECT_URL` migration helper; landing refresh (`LandingHero`, floating agents); `detect-product-language.ts`; `SiteFooter`. |
| 2026-05-26 | Phase 7: smoke-tested production preview URL end-to-end ([Team Sim production](https://ai-engineering-team-simulator.vercel.app)). |
| 2026-05-26 | Phase 7 dashboard: Vercel ↔ Neon linked; `DEEPSEEK_API_KEY` and `DATABASE_URL` on preview + production (already in repo: `maxDuration`, `prisma migrate deploy` during build when `DATABASE_URL` set, [DEPLOYMENT.md](./DEPLOYMENT.md)). |
| 2026-05-24 | **Tool calling + stability:** agent tools (npm + norm lookup), `tool_start`/`tool_end` SSE + UI badges, `agent-stream-text.ts` normalization, role-aware debate tokens, hybrid keyword classification + compliance backend routing, artifact synthesis before `done` SSE, reviewer raw-text decision parse, export via `showSaveFilePicker` + blob fallback + `GET /api/runs/[id]/export`. |
| 2026-05-24 | **Adaptive teams:** LLM classification (`software` / `physical` / `hybrid`), team templates, physical prompts, localized debate + artifacts, `team_ready` SSE, dynamic UI role labels, workspace sidebar SSR, architect stream resilience (`result.text` + flash retry). |
| 2026-05-22 | Phase 7 **shipped**: production at [ai-engineering-team-simulator.vercel.app](https://ai-engineering-team-simulator.vercel.app); README + DEPLOYMENT + MASTERPLAN updated. |
| 2026-05-22 | Phase 7 (repo): `DEPLOYMENT.md`, `.env.example`, build runs `prisma migrate deploy` when `DATABASE_URL` is set (`scripts/prisma-migrate-deploy-if-url.mjs`); MASTERPLAN Phase 7 checklist + README deploy section. |
| 2026-05-22 | Phase 6+ documented: SSR saved-run workspace, static artifact panel + shared sections, sidebar SSR/static delete, regenerate server action, thin scrollbars; perf verification note (prod build). |
| 2026-05-20 | Master plan created; Phases 0–4 complete; 5-agent roster + DeepSeek v4 |
| 2026-05-20 | `Message.agentName`, dynamic roster, scroll layout fix |
| 2026-05-20 | Phase 5: structured artifacts, SSE + API + live panel |
| 2026-05-20 | Phase 6 (partial): glass design system, container-query layout, animations, quote parsing, Markdown export, skeletons |
| 2026-05-20 | Architect uses chat-only stream; sequential artifact gen + JSON fallback; `DELETE /api/runs/[id]` |
| 2026-05-19 | Mobile workspace: sidebar drawer, prompt FAB + sheet, artifacts sheet; hydration + `format-time.ts`; artifact tab mobile spacing |
| 2026-05-19 | Phase 6 complete: `POST /api/runs/[id]/artifacts` regenerate + artifact panel UI |

---

*Last updated: 2026-05-25 (Phase 8 mostly done; Phase 9 partial — DevOps + usage/cost)*
