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

- [ ] **(c) F9 — ownership + list fetch parallelization**
  - `React.cache` dedupes `getSessionUser` / `getRunOwnershipContext` within a request.
  - Sidebar list still awaits ownership first (API requires scope). Explore a scoped list query that can start earlier or batch differently without changing ownership semantics.

- [x] **(d) F3 — CSP nonces** (Sprint 4 Tier 1 — `feature/sprint-4-csp-nonces`)
  - Per-request nonce CSP in `src/proxy.ts` via `buildContentSecurityPolicy`.
  - Production `script-src`: `'self' 'nonce-…' 'strict-dynamic'` (no `'unsafe-inline'` / `'unsafe-eval'`).
  - Dev keeps `'unsafe-eval'` only. Static CSP removed from `next.config.ts`; root layout uses `connection()`.

## Staging note (`0b0c80d`)

Prefer **no amend**. Commit `0b0c80d` bundled Sprint 1 work **with** `package.json` / `package-lock.json` dependency bumps (F12 targets: next 16.2.11, react 19.2.8, ai 7.0.35, `@ai-sdk/deepseek` 3.0.13, prisma 7.9.0, etc.). That staging decision stands; F12 was intentionally not re-committed in Sprint 3.

## ESLint triage

`eslint@10` + `eslint-plugin-react` (via `eslint-config-next`) crashes on `react/display-name` (`getFilename is not a function`). Pinned `eslint` to `^9.39.5` for compatibility.
