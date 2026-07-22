# Resolutions — what changed and why

Maps each finding to the implementation that landed. Prefer this file when a future change touches the same files and you need intent.

## Sprint 1 — `0b0c80d`

Also bundled F12 lockfile bumps (see staging note in [follow-ups.md](./follow-ups.md)). Prefer **no amend** of that commit.

### F1 — Text-delta coalescing

| | |
|--|--|
| **Why** | Stop remapping/re-rendering the full message list on every SSE token. |
| **What** | `text-delta-coalescer.ts` + rAF flush in `simulation-stream-events.ts`; flush on agent/tool boundaries and stream teardown in `use-simulation-stream.ts`; `useDeferredValue` in `message-thread.tsx`. |
| **Preserve** | Scroll still keys off urgent content length so the thread feels live. |

### F2 — Slim recovery progress API

| | |
|--|--|
| **Why** | Full-run polling after SSE drop was too heavy. |
| **What** | `GET /api/runs/[id]/progress` + `src/lib/db/run-progress.ts`; client `recoverRunAfterStreamDrop` polls slim progress, then one full `GET /api/runs/[id]` when status is `complete` \| `failed`. |
| **Note** | App status enum uses `complete`, not `completed`. |

### F5 — Loading / Suspense

| | |
|--|--|
| **Why** | Navigation had no skeleton and blocked on Prisma. |
| **What** | `workspace/loading.tsx`, `runs/[id]/loading.tsx`, `workspace-page-skeleton.tsx`; page-level Suspense after ownership for sidebar. |

### F5 follow-up — HTTP 404 gate — `65f71ef`

| | |
|--|--|
| **Why** | `loading.tsx` wraps **page** in Suspense, so a one-shot fetch saw **200 + skeleton** before `notFound()` in `page.tsx`. |
| **What** | Ownership/existence check moved to `runs/[id]/layout.tsx` (outside that boundary) via `get-cached-run-page-view.ts` + `React.cache`. |
| **Verify** | Invalid / unowned runId → **404**; owned runId → **200**. IDOR still masked as 404 (not 403). |

---

## Sprint 2 — `955eed6`

### F3 — Origin + CSP

| | |
|--|--|
| **Why** | Mutating APIs lacked Origin allowlist; no CSP/security headers. |
| **What** | `src/proxy.ts` (Next 16 Proxy), `src/lib/http/validate-origin.ts`, headers in `next.config.ts`, synthesize worker sets Origin; `DEPLOYMENT.md` notes `NEXT_PUBLIC_APP_URL`. |
| **Open** | CSP still allows `'unsafe-inline'` / `'unsafe-eval'` until nonces (follow-up). |

### F4 — Shared types / constants

| | |
|--|--|
| **Why** | Break agents↔artifacts type cycle; pull shared domain into kernel. |
| **What** | `src/lib/types.ts`, `src/lib/artifact-constants.ts`; feature types re-export; removed deprecated feature shim (callers import `@/lib/...`). |
| **Open** | Remaining feature→feature edges listed in follow-ups. |

### F6 — Lazy live ArtifactPanel

| | |
|--|--|
| **Why** | Defer heavy panel until the live path needs artifacts. |
| **What** | `next/dynamic` in `app-shell.tsx` (`ssr: false`); `SavedRunWorkspace` static path unchanged. |

---

## Sprint 3 — `b7db569`

### F7 — PDF rebuild from owned run

| | |
|--|--|
| **Why** | Persisted exports must not trust client-assembled bodies. |
| **What** | `POST /api/export/pdf` rebuilds from DB when `run.id` is owned; live/`new` keep body path. |

### F8 — Delete rate-limit UX

| | |
|--|--|
| **Why** | 429s looked like silent failures. |
| **What** | `rate-limit-message.ts`; sidebar delete form + client DELETE parse `Retry-After`. |

### F9 — RSC cache / less duplicate work

| | |
|--|--|
| **Why** | Duplicate session/ownership/roster work per request. |
| **What** | `React.cache` on `getSessionUser` / `getRunOwnershipContext`; `RunWorkspaceView.teamRoster` avoids second `getTeamRoster`. |
| **Open** | Ownership→list parallelization (not just dedupe). |

### F10 — Landing hero RSC split

| | |
|--|--|
| **Why** | Marketing copy should not hydrate as a client tree. |
| **What** | RSC `landing-hero.tsx` + client `landing-hero-motion.tsx`. |

### F11 — Text-only XSS docs

| | |
|--|--|
| **Why** | Make the implicit strategy explicit for future HTML work. |
| **What** | `SECURITY.md`. |

### F12 — Dependency bumps

| | |
|--|--|
| **Why** | Align lockfile with npm stable patches. |
| **What** | Shipped inside `0b0c80d` (not re-committed in Sprint 3). |

---

## Verification / tooling — `e104e46`

- Pinned `eslint` to `^9.39.5` — `eslint@10` + `eslint-plugin-react` crashed (`getFilename is not a function`).
- Archived follow-ups / staging notes (also mirrored under this folder).
