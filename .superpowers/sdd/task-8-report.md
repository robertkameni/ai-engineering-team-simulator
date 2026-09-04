# Task 8 Report: Docs + env examples

## Status

**DONE**

## Summary

Documented Forge handoff configuration and rate limiting in `AGENTS.md` and `.env.example` so operators can discover `FORGE_BASE_URL`, `FORGE_PARTNER_SECRET`, and optional `RATE_LIMIT_FORGE_HANDOFF_AUTH`.

## Changes

### `AGENTS.md`

- Rate-limit table: added `forge_handoff` (auth 5/hour) on `POST /api/runs/[id]/forge-handoff`.
- Env bullet: added `FORGE_BASE_URL`, `FORGE_PARTNER_SECRET` (Open in Forge handoff); optional `RATE_LIMIT_FORGE_HANDOFF_AUTH`.

### `.env.example`

- Added Engineering Forge partner handoff block with `FORGE_BASE_URL`, `FORGE_PARTNER_SECRET`, and commented `RATE_LIMIT_FORGE_HANDOFF_AUTH=5`.

## Commit

```text
docs: document Forge handoff env and rate limit
```

SHA: `a9f92fa20ea0c447879986ad201f618c09865041`

## Concerns

- `.env.example` was previously ignored by `.env*` in `.gitignore`; committed with `git add -f`. Consider adding `!.env.example` to `.gitignore` so future edits track normally without force-add.

## Follow-up (gitignore fix)

Added `!.env.example` after `.env*` in `.gitignore` so `.env.example` tracks without force-add; `.env.local` remains ignored.

### Commit

```text
chore: allow tracking .env.example in gitignore
```

SHA: `107ff74`
