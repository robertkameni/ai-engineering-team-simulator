<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack (keep current)

| Layer | Version / choice |
|-------|------------------|
| Next.js | 16 App Router, `src/app` |
| React | 19 — use `React.SubmitEvent`, not deprecated `FormEvent` |
| AI | Vercel AI SDK 7 + `@ai-sdk/deepseek` ^3.0.0, `streamText`, `maxOutputTokens` |
| Agents | Fixed pipeline slots: **PM → Architect → Backend → Frontend → DevOps → Reviewer**. **Template** (`software` \| `physical` \| `hybrid`) chosen by `classifyProjectTeamTemplate()` before debate. Random names per run via `createSimulationRoster(templateId)` + `team-roster` artifact (`templateId` persisted). |
| DeepSeek | **v4 mixed** — PM/FE/devops/reviewer: `deepseek-v4-flash`; architect + backend: `deepseek-v4-pro`. PM, backend, frontend, devops, reviewer use `DEEPSEEK_CHAT_OPTIONS` (`thinking: disabled`). Architect uses `DEEPSEEK_REASONING_OPTIONS` with `reasoningEffort: "low"`. **Debate turn** output caps and temperature (`ACTIVE_AGENTS` in `src/ai/agents/config.ts`, used directly by `run-simulation.ts`): PM 2200/0.4, AR 3200/0.4, BE 2600/0.35, FE 2200/0.4, DevOps 2200/0.4, RV 2600/0.35. Truncated turn → continuation stream (`looks-like-truncated-agent-output.ts`, up to `TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS`). Empty architect stream → `result.text` fallback, then one flash/chat retry at `max(config.maxOutputTokens * 1.5, 2400)`. [API docs](https://api-docs.deepseek.com) |
| Auth | Custom JWT sessions (`jose`) + `bcryptjs` passwords; guest session cookie; ownership via `Run.userId` / `Run.guestSessionId` — `src/lib/auth/*` |
| Rate limits | Upstash Redis (`@upstash/ratelimit`) — `src/lib/rate-limit.ts` (hourly buckets) + `src/lib/auth/auth-rate-limit.ts` (15‑min auth buckets). **Hourly:** `simulate` (guest 3 / auth 30), `delete` (30) on `DELETE /api/runs/[id]` **and** `deleteRunAction`, `export_pdf` (5, MD + PDF), `regenerate` (guest 3 / auth 10) on `POST /api/runs/[id]/artifacts` **and** `regenerateRunArtifactsAction`. **Auth (15 min, IP + SHA‑256 email):** `auth_login`, `auth_register` — 10 attempts each (`RATE_LIMIT_AUTH_*`). Fail closed in production without Redis (`503`). Disabled in dev unless `RATE_LIMIT_ENABLED_IN_DEV=true`. |
| DB | **Prisma 7** + `prisma.config.ts` + `@prisma/adapter-neon` |
| Prisma client | Generated to `src/generated/prisma` — import from `@/generated/prisma/client` |
| DB access | `src/lib/prisma.ts` (`server-only`) + `src/lib/db/*` helpers |
| Artifacts | Post-debate `generateText` + `Output.object` → `Artifact` rows; types in `src/features/artifacts/schemas.ts`. Guidelines and tab labels vary by `templateId` (`artifact-tab-styles.ts`, artifact-tab classes in `artifact-panel.tsx`). |
| Usage / cost | `RunUsageAccumulator` + `src/ai/pricing.ts` — persist via `setRunUsageTotals()`. **Per-run cost ceiling** (`assertSimulationWithinBudget`, `SIMULATION_MAX_COST_USD`, default **$0.75**): classification (`classify-project.ts`), debate (`run-simulation.ts`), artifact synthesis (`generate-run-artifacts.ts` — sequential when accumulator present; assert before/after each `generateText`), regeneration (`regenerate-run-artifacts.ts` — pre-claim check; `budget_exceeded` result). Debate over budget → run `failed`; artifact over budget → `artifactStatus` `failed`, usage saved, `/api/simulate` still sends SSE `done` (not `error`). Regenerate/load paths always persist totals in `persist-regenerate-usage.ts`. |
| Styling | Tailwind 4, shadcn, `tw-animate-css`, dark-first tokens |

## Simulation behavior

- **Classification:** `src/ai/orchestration/classify-project.ts` — keyword hybrid pre-check + flash LLM picks template from product idea; fallback `software`.
- **Templates:** `src/ai/agents/team-templates.ts` — same six slot keys, different display titles per template. `physical` uses `src/ai/prompts/physical/`; `hybrid` uses software prompts with **backend → compliance expert** when physical keywords are in the product idea (`prompts/index.ts`).
- **Prompt routing:** `src/ai/prompts/index.ts` — `getAgentSystemPrompt` / `getAgentTurnPrompt` take `templateId` + `productIdea`. DevOps: `devops.ts` (software) / `physical/devops-site.ts`.
- **Language:** Heuristic detection in `src/ai/context/detect-product-language.ts` (English / French / Chinese; Latin-script defaults to English). Directives via `buildLanguageMatchDirective()` in `build-messages.ts`; artifact titles via `buildArtifactLanguageDirective()` in `generate-run-artifacts.ts`.
- **Debate style:** Dense technical prose with mandatory cross-critique of prior teammates' architectural/library choices (`buildDiscussionDepthRules` in `src/ai/prompts/shared.ts`). Semantic section headings (no hardcoded English `##` titles), no markdown tables. Anti meta-commentary rule in shared depth rules. `[REJECT: role]` routes rejected agent through `buildCorrectionTurnPrompt()` with reviewer feedback excerpt; reviewer re-review via `isReReview` turn prompt. `getMaxSimulationTurns` (software/hybrid 20, physical 16), `MAX_REVIEWER_REJECTION_CYCLES = 4`, `MAX_CORRECTIONS_PER_ROLE = 2`. **Architect quality gate:** insufficient software architect output (fewer than 3 `##` sections or &lt;800 chars) → tool-less flash retry, then synthetic reviewer `[REJECT: architect]` + correction turn (`agent-deliverable-quality.ts`). Truncation → up to two continuation streams (`looks-like-truncated-agent-output.ts`, open backticks / bare HTTP status codes).
- **Tools:** `src/ai/tools/registry.ts` — `check_npm_package` (architect), `search_technical_norm` (compliance expert). Max 3 steps per turn (`stopWhen: stepCountIs(3)`).
- **Stream text:** `src/ai/orchestration/agent-stream-text.ts` — strip tool narration / meta-text, normalize headings, buffer architect preambles; reviewer decision parsed from raw text before tag stripping.
- **SSE events:** `run_started`, `team_ready`, `agent_start`, `text-delta`, `tool_start`, `tool_end`, `agent_end`, `artifacts_start`, `artifact_complete`, `all_artifacts_complete`, `done`, `error` — shapes in `src/lib/simulation-stream.ts`. Emit `team_ready` right after classification. After debate, `/api/simulate` awaits in-process core artifact synthesis (with timeout) before `done`; on timeout `done.artifactTimeout: true` and the client falls back to exponential-backoff polling. Non-abort failures emit generic `error.message` (`"Simulation failed"`); internal details logged server-side only.
- **Duration metrics** (in `Run.summary` JSON): `debateDurationMs` (debate loop only), `artifactDurationMs` / `userWaitMs` (synthesis wall clock; always set on success or failure), `totalDurationMs` (= debate + artifact once synthesis settles; provisional = debate-only while `artifactsPending: true`).
- **Debate outcome UI:** `Run.summary` JSON (`debateOutcome`) → `MockRun.debateOutcome` via `getRunForWorkspace` and `GET /api/runs/[id]/artifacts`. Unapproved outcomes (`cap_reached`, `unknown_reject_fallback`) show an amber banner and subtitle in the artifact panel.
- **Ownership:** `createRun()` stores `userId` or `guestSessionId`. Sidebar, delete, `/runs/[id]`, artifacts GET/POST, and saved-run exports use `buildRunOwnershipWhere()` / `canAccessRun()` / `requireRunAccess()`. `regenerateRunArtifacts()` enforces `requireRunAccess(scope)` at the service layer — all callers must pass `RunOwnershipScope`. Forbidden run access returns **404** `{ error: "Run not found" }` on all run-scoped routes (no IDOR oracle). `GET /api/runs/[id]/export/pdf` uses `getRunForWorkspaceIfOwned` after `requireRunAccess`. `DELETE /api/runs/[id]` returns **404** for both missing and forbidden runs. Register duplicate email → **401** with same message as failed login.
- **Regenerate artifacts:** UI Server Action `regenerateRunArtifactsAction` (in `regenerate-artifacts-action.ts`) → delegates to `regenerate-artifacts-action-logic.ts` (ownership + `regenerate` rate limit); API `POST /api/runs/[id]/artifacts` shares the same limiter bucket.
- **Export:** `exportRunMarkdown()` / `exportRunPdf()` — shared `build-run-export-document.ts` (template-aware labels, parsed debate blocks, usage/outcome); MD client-side (`showSaveFilePicker` + blob); PDF via `md-to-pdf` on server (`GET /api/runs/[id]/export/pdf`, `POST /api/export/pdf` for live runs). **Sign-in required** (guests see `ExportAuthModal`). Saved-run routes enforce ownership + rate limits. **PDF hardening:** static Puppeteer `document_title` (`PDF_DOCUMENT_TITLE` in `export-pdf-limits.ts`); HTML body escaped; message role CSS allowlisted (`resolveExportMessageRoleClass`). **Live PDF POST volumetry** (`export-pdf-payload.ts`, `export-pdf-limits.ts`): 50 msgs, 51 200 chars/msg, 500 artifact items, 2 048 chars/item, 500 title chars, 4 000 prompt chars, 2 MB raw body max.

## Conventions

- Env: `.env.local` at repo root (Prisma CLI loads it via `prisma.config.ts`). Production requires `AUTH_SECRET`; rate limits require Upstash Redis env vars. Optional: `SIMULATION_MAX_COST_USD` (per-run USD ceiling, default $0.75); `RATE_LIMIT_*` overrides per [rate-limit-config.ts](src/lib/rate-limit-config.ts) (`RATE_LIMIT_REGENERATE_*`, `RATE_LIMIT_AUTH_LOGIN`, `RATE_LIMIT_AUTH_REGISTER`, etc.). Security regression tests: `src/test/security/*.test.ts` (`artifact-budget`, `delete-action-rate-limit`, `regenerate-run-artifacts-access`, `regenerate-action-rate-limit`, `auth-rate-limit`, plus existing export/budget/rate-limit suites).
- Do not import `@/lib/prisma` or `@/generated/prisma` in client components.
- API routes: `export const runtime = "nodejs"`, `maxDuration` for multi-agent runs.
- Prefer Server Components; client only for stream UI, sidebar pathname, forms, auth modals.
- Use the latest stable technologies and always follow current best practices.
- Prefer clean, maintainable, and simple solutions.
- Apply D.R.Y. (Don't Repeat Yourself) and K.I.S.S. principles consistently.
- Avoid over-engineering.
- Write readable and maintainable code.
- Prefer composition over duplication.
- Keep functions and components small and focused.
- Use clear naming conventions.
- Prioritize scalability and performance when relevant.
