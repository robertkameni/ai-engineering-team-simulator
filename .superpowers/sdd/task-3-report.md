# Task 3 Report: Forge handoff orchestration logic

## Status

**DONE**

## Summary

Added injectable `executeForgeHandoffPost()` orchestration in `src/lib/api/forge-handoff-logic.ts` with authenticated-user gating, `forge_handoff` rate limiting, owned-run lookup, approved-artifact export gating, Forge config checks, and partner error mapping. Added focused security tests for unauthenticated access, missing run masking, approved-run readiness conflicts, config absence, rate limiting, and successful tracker handoff.

The Forge markdown path uses the injected `buildMarkdown()` output directly and does **not** append an `<!-- export-id -->` trailer.

## TDD Evidence

### RED — failing tests before implementation

Command:

```bash
node --conditions=react-server --import tsx --test src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts
```

Result: **FAIL** (exit code 1) — `Cannot find module '../../lib/api/forge-handoff-logic.js'`

### GREEN — passing tests after implementation

Command:

```bash
node --conditions=react-server --import tsx --test src/test/security/forge-handoff-access.test.ts src/test/security/forge-handoff-rate-limit.test.ts
```

Result: **PASS** (exit code 0)

```
ℹ tests 6
ℹ suites 2
ℹ pass 6
ℹ fail 0
```

## Changes

### `src/lib/api/forge-handoff-logic.ts`

- Added pure, injectable POST orchestration with `ForgeHandoffHooks`
- Reused saved-run export security shape: auth → rate limit → owned fetch → export readiness gate
- Returns `404` for missing or unauthorized runs via owned lookup masking
- Returns `409` when approved-run artifacts are not export-ready
- Returns `503` when Forge partner config is absent
- Calls partner ingest with raw markdown export body and generated filename
- Maps `ForgePartnerError` `429` / `503` to user-safe responses and falls back to `502`

### `src/test/security/forge-handoff-access.test.ts`

- Added unauthenticated access denial test that asserts Forge is not called
- Added missing-run `404` masking test that asserts Forge is not called
- Added approved-run readiness `409` gate test
- Added missing-config `503` test
- Added success test that asserts `trackerUrl` response and confirms markdown is passed through without `<!-- export-id -->`

### `src/test/security/forge-handoff-rate-limit.test.ts`

- Added `429` rate-limit test that asserts Forge submission is skipped

## Self-Review

- **Dependency injection:** Logic depends only on injected hooks, so it remains compatible with `node:test`.
- **Security boundaries:** Authentication, run ownership, rate limiting, and export readiness all short-circuit before Forge submission.
- **Approved-run gating:** `canExportApprovedRun()` is injectable so route wiring can reuse the existing artifact readiness policy without duplicating it here.
- **Markdown contract:** The handoff logic sends the export body as-is rather than the UI download payload that appends an export marker comment.
- **Lint:** No linter diagnostics on edited files.

## Commit

```text
feat: add forge handoff orchestration with security tests
```

## Concerns

- Task 3 intentionally stops at injectable orchestration plus tests; HTTP route wiring and concrete dependency assembly remain for Task 4.
