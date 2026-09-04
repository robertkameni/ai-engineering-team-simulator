# Design: Open in Forge handoff

**Feature**: `forge-handoff`  
**Date**: 2026-09-03  
**Status**: Approved for implementation  
**Peer**: Engineering Forge `specs/002-partner-ingest/design.md` (`the-engineering-forge` repo)  
**Depends on**: Existing run ownership, markdown export (`buildRunMarkdown`), export auth modal, Upstash rate limits

## Summary

After a simulation, logged-in users can start **The Engineering Forge** Spec Kit pipeline directly from Team Sim. The UI shows a primary **Open in Forge** control next to Rerun (live workspace and saved-run footer). Guests see the same control but must sign in via the existing export auth modal.

Team Sim’s **server** rebuilds the run’s markdown export, POSTs it to Forge’s partner ingest API with a shared secret, and returns Forge’s `trackerUrl`. The client opens that URL in a **new tab**. The browser never calls Forge ingest directly.

## Goals

1. One-click handoff from a finished run to Forge’s pipeline tracker.
2. Reuse the same eligibility gate as markdown/PDF export (`canExportApprovedRun`).
3. Enforce auth, ownership (IDOR-safe 404), and a dedicated `forge_handoff` rate limit on the Team Sim side.
4. Work on both **live** composer (after `runId` exists) and **saved-run** footer.
5. Keep Forge URL shape out of Team Sim — always use `trackerUrl` from Forge’s 202 response.

## Non-goals

| Non-goal | Meaning |
|----------|---------|
| One-time handoff tokens (Option B) | No short-lived Forge URLs that carry the brief. Future feature. |
| Browser → Forge CORS ingest | Client does not POST markdown to Forge; only Team Sim backend does. |
| Iframe Forge inside Team Sim | New tab only (Forge forbids embed). |
| Client-supplied markdown | Client sends only `runId`; server rebuilds the brief from the DB. |
| Guest handoff without login | Guests must authenticate first (same pattern as export). |
| Idempotent “same run = same Forge job” | Disable the button while in flight; duplicate clicks may create separate jobs. |
| Changing debate, artifacts, or Spec Kit content | Handoff only packages the existing export and starts Forge. |

## Product decisions (locked)

| Topic | Choice |
|-------|--------|
| Handoff style | Server proxy to Forge partner ingest, then open tracker (Option A / C) |
| Future evolution | Option B (one-time tokens) deferred |
| Eligibility | Same as export: `canExportApprovedRun` |
| Guests | Show button → `ExportAuthModal` on click |
| Surfaces | Live composer **and** saved-run footer |
| Navigation | New tab (`noopener,noreferrer`); open blank tab sync then set location |
| Rate limit | Dedicated hourly bucket `forge_handoff` (not shared with `export_pdf`) |
| Forge API | Peer uses `POST /api/partner/ingest` (dedicated partner route) |

## Architecture

```text
[UI] Open in Forge (primary) next to Rerun
  │
  ├─ guest → ExportAuthModal → stop
  └─ authed + runId
        │
        │  1. window.open("about:blank")   // sync — avoid popup block
        │  2. POST /api/runs/[id]/forge-handoff
        ▼
[Team Sim API]
  · require authenticated session
  · assertRateLimit(..., "forge_handoff", userId)
  · getRunForWorkspaceIfOwned → 404 if missing/forbidden
  · canExportApprovedRun → 409 if not export-ready
  · markdown = buildRunMarkdown(...)     // no <!-- export-id --> for Forge
  · filename = buildRunMarkdownFilename(...)
  · POST {FORGE_BASE_URL}/api/partner/ingest
        Authorization: Bearer FORGE_PARTNER_SECRET
        Content-Type: application/json
        { markdown, sourceFilename }
  · parse 202 → { trackerUrl }
  · return { trackerUrl } to client
        ▼
[UI] blankTab.location = trackerUrl
        ▼
[Forge] /?job=<uuid> → Track tab + existing JobStatusTracker
```

### Design rules

1. **Single route** for live and saved: `POST /api/runs/[id]/forge-handoff`. Live runs already receive `runId` on `run_started` / navigate to `/runs/[id]`.
2. **Client sends only `runId`** (path param). Never trust client markdown.
3. **Use Forge `trackerUrl` only** — do not open `statusUrl` (API poll URL) and do not hardcode `/?job=` in Team Sim.
4. **Handoff markdown** is the same document as export, without the export-only `<!-- export-id: … -->` footer.

## Components

### UI — Open in Forge button

| Surface | Placement |
|---------|-----------|
| Saved runs | `SavedRunFooter` — primary button beside Rerun / New simulation |
| Live workspace | `PromptComposer` desktop row (and mobile sheet parity) beside Rerun when `runId` is set and the run is not mid-flight |

**Visibility**
- Shown whenever a handoff target exists (`runId`) and the surface is in a post-run / saved context.
- Guests: visible; click opens `ExportAuthModal` (reuse export modal or shared auth gate).
- Authed but not export-ready: disabled or click → clear 409 message (same copy family as export).
- Missing `runId`: hide or disable (no client-only handoff path).

**Interaction**
1. If `!isAuthenticated` → open auth modal; return.
2. Open `about:blank` synchronously.
3. `POST /api/runs/${runId}/forge-handoff`.
4. On success → set blank tab to `trackerUrl`.
5. On failure → close blank tab if possible; show error toast/banner; re-enable button.

**Label (V1):** `Open in Forge` (primary variant). Icon optional (e.g. external-link); keep secondary to Rerun’s outline/secondary treatment so Forge reads as the forward CTA.

### API — `POST /api/runs/[id]/forge-handoff`

| Step | Behavior |
|------|----------|
| Auth | Require logged-in user (same bar as export). Guests never reach successful handoff. |
| Rate limit | `forge_handoff` hourly bucket; return existing 429/503 rate-limit response shape |
| Ownership | `getRunForWorkspaceIfOwned` / `requireRunAccess` — **404** `Run not found` for missing or forbidden |
| Eligibility | `canExportApprovedRun({ debateOutcome, artifacts })` — **409** if approved but core artifacts incomplete |
| Build brief | `buildRunMarkdown` + `buildRunMarkdownFilename`; roster `templateId` when available |
| Call Forge | Server `fetch` to partner ingest with bearer secret; map Forge errors by `code` |
| Success | **200** `{ trackerUrl: string }` (Team Sim wrapper; Forge’s full 202 stays internal) |

Route config: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, short `maxDuration` (enqueue-only upstream).

### Forge client module

Thin server-only helper, e.g. `src/lib/forge/submit-partner-ingest.ts`:

- Reads `FORGE_BASE_URL`, `FORGE_PARTNER_SECRET` from validated config.
- POSTs JSON; expects 202 with `trackerUrl`.
- Throws typed errors for 401/400/429/503 so the route can map to user-safe messages without leaking secrets.

### Rate limit

Extend `RateLimitAction` with `forge_handoff`:

| | Guest | Auth |
|--|-------|------|
| Default | unused (auth-only action) | **5**/hour (env-overridable) |

Env keys: `RATE_LIMIT_FORGE_HANDOFF_AUTH` (and guest key only if the shared config type requires both).

Do **not** share the `export_pdf` bucket — Forge jobs are heavier than PDF generation.

### Config

| Variable | Required | Purpose |
|----------|----------|---------|
| `FORGE_BASE_URL` | Yes (prod when feature enabled) | e.g. `https://forge.lucastar.de` |
| `FORGE_PARTNER_SECRET` | Yes (same value as Forge) | Bearer for partner ingest |
| `RATE_LIMIT_FORGE_HANDOFF_AUTH` | Optional | Override default 5/hour |

Validate at startup / config module; fail fast in production if the feature is enabled without both Forge vars. Prefer a single typed config object (project convention) over scattering `process.env` in the route.

## Module map

| Path | Change |
|------|--------|
| `src/app/api/runs/[id]/forge-handoff/route.ts` | **New** — HTTP entry |
| `src/lib/forge/submit-partner-ingest.ts` | **New** — server Forge client |
| `src/lib/forge/forge-config.ts` (or extend existing env config) | **New/edit** — typed Forge env |
| `src/lib/rate-limit-config.ts` | **Edit** — `forge_handoff` action |
| `src/features/workspace/saved-run-footer.tsx` | **Edit** — primary Forge button |
| `src/features/simulation/prompt-composer.tsx` (+ types / mobile sheet) | **Edit** — Forge control when `runId` present |
| `src/features/workspace/open-in-forge-button.tsx` (suggested) | **New** — shared button + auth modal + blank-tab handoff |
| `src/test/security/forge-handoff-*.test.ts` | **New** — auth, ownership 404, rate limit, eligibility 409 |

Reuse without duplication where practical:

- `canExportApprovedRun` from `artifact-panel-phase`
- `buildRunMarkdown` / `buildRunMarkdownFilename`
- `ExportAuthModal` / auth session helpers used by export
- `assertRateLimit` / `rateLimitResponse`

## Security

| Concern | Handling |
|---------|----------|
| IDOR | Ownership check; forbidden → **404** (no oracle) |
| Auth | Session required for successful handoff |
| Secret | `FORGE_PARTNER_SECRET` only on server (`server-only`); never to client |
| Markdown trust | Built from owned DB run, not request body |
| Origin | Existing state-changing Origin checks if applied to other run POSTs — follow same pattern as sibling routes |
| Logging | Log `runId`, Forge `jobId` if returned, error `code`; never log bearer or full markdown |

## Error mapping (Team Sim → UI)

| Condition | HTTP | User-facing intent |
|-----------|------|--------------------|
| Not authenticated | 401 | Prompt sign-in (modal) |
| Rate limited | 429 | Retry later |
| Run missing/forbidden | 404 | Run not found |
| Artifacts not ready | 409 | Wait for synthesis / retry |
| Forge misconfigured | 503 | Feature unavailable |
| Forge 401/503/429/400 | 502/503/429/400 | Generic “Could not start Forge” + retry; map rate-limit if Forge 429 |

Do not echo Forge German messages verbatim unless useful; prefer stable Team Sim copy keyed off status/`code`.

## Test plan

1. Unauthenticated → 401 (or redirect/modal path); no Forge call.
2. Other user’s `runId` → 404; no Forge call.
3. Approved without core artifacts → 409.
4. `forge_handoff` rate limit → 429 after threshold.
5. Happy path (mocked Forge 202) → 200 `{ trackerUrl }`; Forge client called with bearer + JSON body.
6. Forge 401/503 → safe error; secret not in response body.
7. UI: guest click opens auth modal; authed click opens blank tab then navigates (unit/hook-level where feasible).

## Implementation order

1. Config + rate-limit action + Forge client helper.
2. `POST /api/runs/[id]/forge-handoff` + security tests.
3. Shared `OpenInForgeButton` (auth modal, pending, blank-tab).
4. Wire `SavedRunFooter` and live `PromptComposer` (+ mobile parity).
5. Smoke against Forge peer once partner ingest is live.

## Future (deferred)

- **Option B:** one-time handoff tokens issued by Forge or Team Sim.
- Pass optional `externalRunId` metadata to Forge for correlation.
- Idempotency key per `runId` to dedupe double submits.

## Approval

Product and architecture locked in design discussion with peer Forge `002-partner-ingest`. Ready for an implementation plan and coding in this repo (coordinate with Forge partner route + `trackerUrl`).
