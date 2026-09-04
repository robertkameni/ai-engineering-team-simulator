# Task 7 Report: Wire live PromptComposer (+ mobile)

## Status

**DONE**

## Summary

Wired live `PromptComposer` Forge access for both desktop and mobile live workspaces. The composer now receives `runId` and `isAuthenticated`, shows `Open in Forge` only when a live run exists, and keeps the control disabled while a simulation is running.

## Verification

### Typecheck

```bash
npx tsc --noEmit
```

Result: **PASS** (exit code 0)

## Changes

### `src/features/simulation/prompt-composer-types.ts`

- Added optional `runId` and `isAuthenticated` props to the composer contract.

### `src/features/simulation/prompt-composer.tsx`

- Added desktop live-workspace button row behavior.
- Shows outline `Rerun simulation` plus `Open in Forge` when `runId` is present.
- Keeps Forge hidden until a live run exists and disables it while the simulation is running.
- Threads Forge props into the mobile sheet.

### `src/features/simulation/prompt-composer-mobile-sheet.tsx`

- Renders `Open in Forge` below the form when `runId` is present.
- Leaves the mobile FAB behavior unchanged.

### `src/features/workspace/simulation-workspace.tsx`

- Passes `runId` and `isAuthenticated` into `PromptComposer`.

## Commit

```text
feat: show Open in Forge on live simulation composer
```

## Concerns

- No focused UI/component test was added because the repo does not currently expose a nearby component test harness for this surface; verification for this task is typecheck-based.
