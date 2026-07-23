# Fallow cleanup resolutions (2026-07)

Findings from a post–`e1a663b` dead-code / clone pass. Status per finding
(verified with disk reads + `fallow dupes --changed-since main --no-cache`
and/or structural confirmation):

| ID | Path | Status | Notes |
|----|------|--------|-------|
| 1 | `resolve-reviewer-outcome.ts` ↔ `debate-convergence-controller.ts` | **fixed** | `planPostApproveTruncationRecovery` in `truncation-approval-gate.ts`. |
| 2 | `truncation-approval-gate.ts` `CRITICAL_TRUNCATION_ROLES` | **already-fixed** | Module-local since `e1a663b`. |
| 3 | `pricing.ts` ↔ `rate-limit-config.ts` | **already-fixed** | Shared `parseEnvNumber` + domain validators. |
| 4 | `login/route.ts` unused `setAuthSessionCookie` | **fixed** | Removed unused import. |
| 5 | `register/route.ts` ↔ `login/route.ts` | **already-fixed** | Shared `auth-route-helpers`. |
| 6 | artifacts ↔ runs ops fields | **fixed** | Shared ops summary helpers. |
| 7 | export MD ↔ PDF routes | **fixed** | Route files are re-exports only; logic in `handle-saved-run-markdown-export.ts` (uses `resolveAuthenticatedExportRoute`) vs `handle-saved-run-pdf-export.ts` (uses `requireAuthenticatedExportSession` + await params) — deliberately different auth shapes. |
| 8 | progress ↔ runs/[id] routes | **fixed** | Progress is `export { GET } from handle-run-progress-get` (`loadOwnedRunResource`); runs/[id] uses `resolveOwnedRunRoute` + direct loader — different call shapes. |
| 9 | `countCoreArtifacts` / `hasCoreArtifacts` | **already-fixed** | Module-local `function` (not exported). IDE cache if still shown. |
| 10 | `regenerate-artifacts-action-logic.types.ts` | **fixed** | Deleted again if resurrected; action imports hooks directly. |
| 11 | schemas CORE/LAZY | **already-fixed** | Only `ARTIFACT_TYPES` re-exported from schemas. |
| 12 | `POLL_ARTIFACT_BACKOFF_FACTOR` | **already-fixed** | Module-local. |
| 13 | `simulation-stream-events` error/done | **fixed** | `handleStreamErrorEvent` / `handleStreamDoneEvent` + shared `flushAndMarkStreamSettled`. |
| 14 | `simulation-stream-polling` waits | **fixed** | Single `waitForAbortableTimeout` + `fetchJsonOrNull`. |
| 15 | `ARTIFACT_SYNTHESIS_AWAIT_TIMEOUT_MS` | **already-fixed** | Module-local. |
| 16 | regenerate post-logic types | **already-fixed** | Extends `RegenerateArtifactsAccessHooks`. |
| 17 | `run-progress` + `runs.ts` ownership | **fixed** | Constant unexported; `canAccessRun` in `run-ownership-where.ts`. |
| 18 | `run-reconcile` internal | **already-fixed** | `finalizeStaleRunFromLastMessage`. |
| 19 | ops fields types | **fixed** | `Partial<OpsFollowUpCheckpoint>` + `ArtifactErrorTelemetry`. |
| 20 | `runs.ts` pair | **fixed** | With #17. |
| 21 | `run-pdf-client` | **already-fixed** | `readPdfBlobFromResponse`. |
| 22 | saved-run PDF ↔ live PDF | **fixed** | `buildCompiledPdfAttachmentResponse`. |
| 23 | rate-limit-config pair | **already-fixed** | See #3. |
| 24 | test rate-limit-response | **already-fixed** | Re-export only. |
| 25 | `use-simulation-stream` exhaustive-deps | **fixed** | Removed intermediate `artifactSetters` object; inlined stable `useState` setters into `recoverAfterDrop` deps (avoids `react-hooks/refs` render write). |

## Deferred

None.
