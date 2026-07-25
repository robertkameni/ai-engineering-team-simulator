# Follow-ups (intentionally post-merge)

Open items after F1–F12 shipped. Do **not** treat these as merge blockers for the original review PR.

## Checklist

- [x] **(a) F4 — remaining feature→feature edges** (Sprint A — 2026-07-25)
  - ESLint `no-restricted-imports` on non-workspace features (`eslint.config.mjs`).
  - PromptComposer takes `runSession` props from workspace (no workspace context import).
  - Header action styles live in `@/components/ui/button-styles`.
  - Avatars/personas shared via `@/components/agents` + `@/lib/agents/personas`; example chips via `@/components/example-prompt-chips`.

- [ ] **(b) F5 — finer-grained Suspense for roster (deferred — reactivation criteria below)**
  - **Status:** Deferred. Route `loading.tsx` + 404 gate + post-ownership Suspense are in place and verified (404/404/200 trio). The remaining finer-grained split (roster as its own Suspense child) is incremental polish, not a regression.
  - **Reactivate (b) if ANY of these is true:**
    - Production p95 on `/runs/[id]` LCP exceeds **1500ms** over a 7-day window (via `RunPagePerfObserver` console `[perf]` logs / future aggregation)
    - **3+** user-reported perceived slowness complaints on opening a saved run within 30 days
    - Roster evolves into its own scannable feature (expandable per-agent view, multi-roster per page) that warrants independent streaming
  - Do **not** reactivate based on “it’s a known follow-up.” Reactivate based on signal.

- [x] **(c) F9 — ownership + list fetch** (Sprint 4 Tier 2 investigation — **closed**)
  - **Finding:** `listRecentRuns` filters at the **DB layer** via `buildRunOwnershipWhere(scope)` → Prisma `findMany({ where, take })`. Not “fetch all then filter client-side.”
  - Empty scope returns `[]` (no unscoped query). Post-query `.filter` is only stale `RUNNING` reconcile on the already-scoped set.
  - Call sites: `GET /api/runs`, workspace/run RSC pages → `listRecentRunsForSidebar(ownership, 12)`.
  - Original parallelization idea remains optional perf only; **not** an authorization issue — no further work unless reopened for latency.

- [x] **(d) F3 — CSP nonces** (Sprint 4 Tier 1 — `feature/sprint-4-csp-nonces`)
  - Per-request nonce CSP in `src/proxy.ts` via `buildContentSecurityPolicy`.
  - Production `script-src`: `'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'` / `'unsafe-eval'`).
  - Dev keeps `'unsafe-eval'` only. Static CSP removed from `next.config.ts`; root layout uses `connection()`.

## Staging note (`0b0c80d`)

Prefer **no amend**. Commit `0b0c80d` bundled Sprint 1 work **with** `package.json` / `package-lock.json` dependency bumps (F12 targets: next 16.2.11, react 19.2.8, ai 7.0.35, `@ai-sdk/deepseek` 3.0.13, prisma 7.9.0, etc.). That staging decision stands; F12 was intentionally not re-committed in Sprint 3.

## ESLint triage

`eslint@10` + `eslint-plugin-react` (via `eslint-config-next`) crashes on `react/display-name` (`getFilename is not a function`). Pinned `eslint` to `^9.39.5` for compatibility.
