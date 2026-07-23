# Follow-ups (intentionally post-merge)

Open items after F1–F12 shipped. Do **not** treat these as merge blockers for the original review PR.

## Checklist

- [ ] **(a) F4 — remaining feature→feature edges**
  - Landing still imports agents avatars / personas for floating UI.
  - Simulation `prompt-composer` still imports workspace run context (invert: pass props from workspace).
  - Artifacts `regenerate-artifacts-button` still imports workspace header button styles (move shared styles to `src/lib` or `src/components`).

- [ ] **(b) F5 — finer-grained Suspense for roster**
  - Route `loading.tsx` + layout 404 gate + post-ownership Suspense are in place.
  - Still missing: stream sidebar and team roster as separate Suspense children without waiting on the full `SavedRunPageBody` fetch batch.

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
