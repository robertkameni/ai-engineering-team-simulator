# Architecture review follow-ups

Canonical checklist: **[docs/architecture-review/2026-07-frontend/follow-ups.md](./docs/architecture-review/2026-07-frontend/follow-ups.md)**

## (b) F5 — finer-grained Suspense for roster (deferred — reactivation criteria below)

**Status:** Deferred. Route `loading.tsx` + 404 gate + post-ownership Suspense are in place and verified (404/404/200 trio). The remaining finer-grained split (roster as its own Suspense child) is incremental polish, not a regression.

**Reactivate (b) if ANY of these is true:**

- Production p95 on `/runs/[id]` LCP exceeds **1500ms** over a 7-day window (via the observer below)
- **3+** user-reported perceived slowness complaints on opening a saved run within 30 days
- Roster evolves into its own scannable feature (expandable per-agent view, multi-roster per page) that warrants independent streaming

Do **not** reactivate based on “it’s a known follow-up.” Reactivate based on signal.

Observer: `RunPagePerfObserver` on `/runs/[id]` logs `[perf] /runs/[id] LCP|FCP:` to the console (data-gathering only; no analytics endpoint yet).

Full finding catalog: **[docs/architecture-review/2026-07-frontend/](./docs/architecture-review/2026-07-frontend/)**
