# Frontend architecture review — July 2026

| Field | Value |
|-------|-------|
| **Date** | 2026-07-22 |
| **Branch / PR** | `feature/architectura-review-fix` → [PR #7](https://github.com/robertkameni/ai-engineering-team-simulator/pull/7) |
| **Stack** | Next.js 16.2 App Router, React 19, TypeScript 6, AI SDK 7, DeepSeek v4, Prisma 7 |
| **Source** | Codebase exploration + npm registry latests (Fallow full scan timed out) |
| **Interactive canvas** | Cursor canvas `frontend-architecture-review` (local; not in git) |

## Verdict

Strong **dual-shell** design (live client island vs saved RSC path), solid auth cookie posture, and safe text-only AI rendering. Primary debt was stream render cost, recovery poll payload size, missing Origin/CSP middleware, and unenforced feature boundaries — not uncontrolled HTML or cookie mishandling.

## Documents in this folder

| File | Purpose |
|------|---------|
| [findings.md](./findings.md) | All 12 findings (F1–F12): problem, recommended action, severity, ship status |
| [resolutions.md](./resolutions.md) | What we changed and **why**, mapped to commits and key files |
| [follow-ups.md](./follow-ups.md) | Open items that intentionally did not block merge |
| [constraints.md](./constraints.md) | What the review explicitly said **not** to change |

## Sprint plan (as executed)

```
Sprint 1 — Render & poll cost     F1, F2, F5
Sprint 2 — Security & boundaries  F3, F4, F6
Sprint 3 — Polish & deps          F7–F12
Post-merge hardening              F5 negative-path HTTP 404 (layout gate)
```

## Commit index

| Commit | Summary |
|--------|---------|
| `0b0c80d` | Sprint 1 (F1, F2, F5) + package bumps (F12 staged here) |
| `955eed6` | Sprint 2 (F3, F4, F6) |
| `b7db569` | Sprint 3 (F7–F11; F12 already current) |
| `65f71ef` | Fix: invalid `/runs/[id]` must return HTTP 404 (not 200 + skeleton) |
| `e104e46` | Verification: eslint ^9 pin + FOLLOWUPS staging note |

## Architecture strengths (context for future edits)

1. **Dual-shell workspace** — Live: `SimulationWorkspace` → `AppShell` → stream. Saved: `SavedRunWorkspace` (RSC) → `AppShellFrame` → `*Static` components. Prefer this over forcing everything client-side.
2. **Streaming resilience** — Abort-aware SSE, heartbeats, artifact poll backoff; synthesis can continue after client disconnect.
3. **Security baselines** — httpOnly JWT + signed guest cookies; IDOR masked as 404; Upstash rate limits; no `dangerouslySetInnerHTML`.
4. **Stack currency** — Next 16 / React 19 / AI SDK 7 / Zod 4 / Prisma 7; TypeScript stays on ^6 by convention.
