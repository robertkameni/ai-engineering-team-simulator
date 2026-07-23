# Fallow cleanup resolutions (2026-07)

Findings from a post–`e1a663b` dead-code / clone pass. Many diagnostics were
stale after that commit. Status per finding:

| ID | Path | Status | Notes |
|----|------|--------|-------|
| 1 | `resolve-reviewer-outcome.ts` ↔ `debate-convergence-controller.ts` | **fixed** | Extracted `planPostApproveTruncationRecovery` in `truncation-approval-gate.ts`; both call sites use it. |
| 2 | `truncation-approval-gate.ts` `CRITICAL_TRUNCATION_ROLES` | **already-fixed** | Module-local `const` (not exported) since `e1a663b`. |
| 3 | `pricing.ts` ↔ `rate-limit-config.ts` | **already-fixed** | Both use shared `parseEnvNumber`; remaining wrappers are domain validators (rate ≥0 vs limit >0). |
| 4 | `login/route.ts` unused `setAuthSessionCookie` | **fixed** | Removed unused import (session finalized via `finalizeAuthenticatedUserSession`). |
| 5 | `register/route.ts` ↔ `login/route.ts` | **already-fixed** | Shared `auth-route-helpers` already; remaining preamble is route-specific (messages, Prisma create vs lookup). |
| 6 | `runs/[id]/artifacts/route.ts` ↔ `runs/[id]/route.ts` | **fixed** | Shared `opsFollowUpApiFieldsFromSummaryPayload` / `opsFollowUpFieldsFromSummaryPayload` in `ops-follow-up-summary.ts`. |
| 7 | `runs/[id]/export/pdf/route.ts` ↔ `export/route.ts` | **fixed** | Shared `resolveAuthenticatedExportRoute` (+ `requireAuthenticatedExportSession`) in `src/lib/export/require-authenticated-export-session.ts`; live PDF POST uses the session helper; PDF body via `handleSavedRunPdfExport` / `buildCompiledPdfAttachmentResponse`. |
| 8 | `runs/[id]/progress/route.ts` ↔ `runs/[id]/route.ts` | **fixed** | Shared `loadOwnedRunResource` / `resolveOwnedRunRoute` / `runNotFoundResponse` / `OwnedRunRouteParams` in `src/lib/api/owned-run-route.ts`. |
| 9 | `artifact-panel-phase.ts` `countCoreArtifacts` / `hasCoreArtifacts` | **already-fixed** | Module-local functions (not exported). |
| 10 | `regenerate-artifacts-action-logic.types.ts` | **fixed** | Alias file deleted; action logic imports `RegenerateArtifactsAccessHooks` from `@/lib/api/regenerate-artifacts-hooks`. |
| 11 | `schemas.ts` `CORE_ARTIFACT_TYPES` / `LAZY_ARTIFACT_TYPES` | **already-fixed** | Live in `artifact-constants.ts`; schemas re-exports `ARTIFACT_TYPES` only. |
| 12 | `artifact-poll-backoff.ts` `POLL_ARTIFACT_BACKOFF_FACTOR` | **already-fixed** | Module-local `const`. |
| 13 | `simulation-stream-events.ts` internal dup | **fixed** | Extracted `flushAndMarkStreamSettled`; error + done handlers share it. |
| 14 | `simulation-stream-polling.ts` internal dup | **fixed** | Single `waitForAbortableTimeout`; slim/full fetchers share `fetchJsonOrNull`. |
| 15 | `schedule-artifact-synthesis.ts` `ARTIFACT_SYNTHESIS_AWAIT_TIMEOUT_MS` | **already-fixed** | Module-local `const`. |
| 16 | `regenerate-artifacts-post-logic.ts` (pair of #10) | **already-fixed** | Post hooks extend `RegenerateArtifactsAccessHooks`; no duplicate type alias. |
| 17 | `run-progress.ts` unused + dup with `runs.ts` | **fixed** | `RUN_PROGRESS_LAST_MESSAGE_MAX_CHARS` is module-local; `canAccessRun` moved to `run-ownership-where.ts` (sole ownership module with `buildRunOwnershipWhere`); `runs.ts` re-exports it. |
| 18 | `run-reconcile.ts` internal dup | **already-fixed** | Shared `finalizeStaleRunFromLastMessage`; batch path keeps batched queries by design. |
| 19 | `run-summary.types.ts` ops fields ↔ `lib/types.ts` | **fixed** | Both compose `OpsFollowUpCheckpoint` / `Partial<OpsFollowUpCheckpoint>`; `MockRun.artifactError` uses shared `ArtifactErrorTelemetry`. |
| 20 | `runs.ts` (pair of #17) | **fixed** | Ops summary mapping delegates to `opsFollowUpFieldsFromSummaryPayload`; ownership via `run-ownership-where`. |
| 21 | `run-pdf-client.ts` PDF response parse | **already-fixed** | Single `readPdfBlobFromResponse` used by saved + live paths. |
| 22 | `saved-run-pdf-export-logic.ts` ↔ export PDF route | **fixed** | Both use `buildCompiledPdfAttachmentResponse` from `pdf-attachment-response.ts` (compile + attachment + shared error handling). |
| 23 | `rate-limit-config.ts` (pair of #3) | **already-fixed** | See #3. |
| 24 | `test/shared/rate-limit-response.ts` | **already-fixed** | Re-exports production `rateLimitResponse`. |

## Deferred

None — all previously deferred route-preamble items (#7, #8) are fixed via shared helpers.
