# Findings catalog (F1–F12)

Original prioritized findings from the 2026-07 frontend architecture review. Status reflects merge of PR #7 plus the F5 404 hardening commit.

| ID | Sev | Area | Status |
|----|-----|------|--------|
| F1 | P0 | Performance | Shipped |
| F2 | P0 | Scalability | Shipped |
| F3 | P1 | Security | Shipped (CSP nonces still open — see follow-ups) |
| F4 | P1 | Maintainability | Partially shipped (shared types done; some feature→feature edges remain) |
| F5 | P1 | Performance | Shipped + 404 regression fixed |
| F6 | P1 | Performance | Shipped |
| F7 | P2 | Security | Shipped |
| F8 | P2 | DX / UX | Shipped |
| F9 | P2 | Scalability | Partially shipped (cache/dedupe done; list parallelization open) |
| F10 | P2 | Maintainability | Shipped |
| F11 | P3 | Security | Shipped (`SECURITY.md`) |
| F12 | P3 | DX | Shipped (bundled in `0b0c80d`) |

---

## F1 — Throttle text-delta React updates

- **Severity:** P0 · Performance
- **Problem:** Every SSE `text-delta` remapped the full messages array and re-rendered `MessageThread` (scroll keyed on `lastContentLength`). High-frequency deltas made the live debate feel janky and burned main-thread time.
- **Recommended action:** Coalesce deltas with `requestAnimationFrame`; sparse-update the active message; use `useDeferredValue` for list paint (React 19).
- **Why it mattered:** Streaming is the product’s core UX. Unthrottled React updates scale with token rate, not with “one message.”

## F2 — Lighten stream-drop recovery polling

- **Severity:** P0 · Scalability
- **Problem:** `recoverRunAfterStreamDrop` fetched the **full** run (messages + artifacts) every ~2s for up to ~16 minutes after SSE drop.
- **Recommended action:** Slim progress endpoint (`status`, `messageCount`, last-message preview) until terminal, then **one** full `GET /api/runs/[id]`.
- **Why it mattered:** Dropped connections under load would DDoS our own API and Neon with oversized payloads.

## F3 — No middleware / Origin validation

- **Severity:** P1 · Security
- **Problem:** No `middleware.ts` / `proxy.ts`. Mutating routes relied on SameSite=Lax cookies; project rules require Origin allowlists. No CSP/security headers in `next.config`.
- **Recommended action:** Shared `validateOrigin` on POST/DELETE; CSP + security headers; document `NEXT_PUBLIC_APP_URL`.
- **Why it mattered:** Cookie-only CSRF posture is weaker than Origin checks for browser-initiated mutating fetches.

## F4 — Feature boundary violations + type cycle

- **Severity:** P1 · Maintainability
- **Problem:** `agents/types.ts` ↔ `artifacts/types.ts` cycle; features imported each other; architecture rules call for shared kernel in `src/lib` / `src/shared`.
- **Recommended action:** Extract shared domain types/constants into `src/lib`; keep workspace as composition root.
- **Why it mattered:** Cycles and feature→feature imports make refactors unsafe and violate the feature-folder contract.

## F5 — Missing `loading.tsx` / Suspense

- **Severity:** P1 · Performance
- **Problem:** No route `loading.tsx` and little Suspense; workspace/run pages blocked on ownership + Prisma with no skeleton.
- **Recommended action:** Add `loading.tsx` for `/workspace` and `/runs/[id]`; Suspense secondary fetches after ownership/404.
- **Why it mattered:** Perceived latency on navigation; also interacted badly with 404 (see resolutions — `loading.tsx` Suspense streamed 200 before `notFound()`).

## F6 — Large live-path client island

- **Severity:** P1 · Performance
- **Problem:** Live path hydrated `AppShell` + sidebar + `ArtifactPanel` + stream stack together (~47 `use client` modules in the tree).
- **Recommended action:** `next/dynamic` lazy-load live `ArtifactPanel` until artifacts are needed; keep saved RSC dual-shell.
- **Why it mattered:** Artifact UI is unused for most of a debate; deferring it cuts initial live JS.

## F7 — Live PDF trusts client payload

- **Severity:** P2 · Security
- **Problem:** `POST /api/export/pdf` accepted a client-built body (Zod volumetry). Saved PDF already rebuilt from owned `runId`.
- **Recommended action:** When `run.id` is persisted and owned, rebuild from DB; keep body path only for live/`new` unsaved runs.
- **Why it mattered:** Client-supplied export content can diverge from the canonical owned run.

## F8 — Delete rate-limit UX gap

- **Severity:** P2 · DX / UX
- **Problem:** DELETE 429 and Server Action `rate_limited` failed silently/generically in the sidebar.
- **Recommended action:** Parse `Retry-After`; surface the same “Too many…, retry in Xs” pattern as simulate/regenerate.
- **Why it mattered:** Guests hit delete limits; silent failure looks like a broken UI.

## F9 — RSC waterfalls and duplicate work

- **Severity:** P2 · Scalability
- **Problem:** Sidebar list waited after ownership; run page re-fetched ownership / `getTeamRoster` redundantly.
- **Recommended action:** `React.cache` on session/ownership; drop redundant roster query when the workspace view already has it; explore earlier list start.
- **Why it mattered:** Extra serial awaits on every workspace/run navigation.

## F10 — Landing hero is fully client

- **Severity:** P2 · Maintainability
- **Problem:** `landing-hero` was `"use client"` for motion/pathname; static marketing copy paid hydration cost.
- **Recommended action:** RSC shell + small client island for motion.
- **Why it mattered:** Landing is the LCP surface; static copy does not need a client boundary.

## F11 — Document text-only XSS strategy

- **Severity:** P3 · Security
- **Problem:** No `dangerouslySetInnerHTML`; AI output is React text. Rules mentioned DOMPurify but the FE never parses HTML — strategy was implicit.
- **Recommended action:** Codify text-only escape in `SECURITY.md`; gate future rich HTML behind a sanitizer.
- **Why it mattered:** Future contributors might “helpfully” add HTML rendering without a threat model.

## F12 — Patch dependency drift

- **Severity:** P3 · DX
- **Problem:** Patch/minor lag vs npm stable (Next 16.2.11, React 19.2.8, AI SDK 7.0.35, DeepSeek 3.0.13, Prisma 7.9, etc.). TypeScript 7 exists but project pins ^6.
- **Recommended action:** Bump lockfile to latest stables; stay on TypeScript 6 until a planned migration.
- **Why it mattered:** Security/bugfix patches; avoid silent drift between AGENTS.md and lockfile.
