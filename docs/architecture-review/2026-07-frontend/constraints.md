# Constraints — what not to undo

The review explicitly preserved these product decisions. Future refactors should treat them as invariants unless a new architecture review supersedes them.

## Keep

1. **Live vs saved dual-shell**  
   Live simulation stays a client island (`SimulationWorkspace` / `AppShell` + SSE). Saved runs stay RSC-friendly (`SavedRunWorkspace` / `AppShellFrame` / `*Static`). Do not force one shell for both.

2. **Text-only AI rendering**  
   Debate messages and artifacts render as React text nodes — no `dangerouslySetInnerHTML` for model output. Rich HTML would need a new threat model + sanitizer (see F11 / `SECURITY.md`).

3. **Server Actions + rate limits for regenerate/delete**  
   Keep ownership checks and Upstash buckets on those mutations. Do not move them to unauthenticated client-only paths.

4. **No global client cache library yet**  
   Manual SSE + poll is appropriate for a single streaming surface. Do not introduce React Query / similar until multiple clients need a shared cache.

## Request / data flow (reference)

```
Live:  useSimulationStream → POST /api/simulate (SSE)
         → events / progress poll on drop
         → optional artifacts GET
         → router.replace /runs/[id]

Saved: runs/[id]/layout → notFound if missing/unowned
         → page Suspense → SavedRunWorkspace (RSC)

Auth / export:
  ExportAuthModal → login/register → claim-guest-runs
  → MD client-side / PDF GET owned or POST live payload
```
