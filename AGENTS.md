<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Stack (keep current)

| Layer | Version / choice |
|-------|------------------|
| Next.js | 16 App Router, `src/app` |
| React | 19 — use `React.SubmitEvent`, not deprecated `FormEvent` |
| AI | Vercel AI SDK 6 + `@ai-sdk/deepseek`, `streamText`, `maxOutputTokens` |
| Agents | Fixed pipeline slots: **PM → Architect → Backend → Frontend → DevOps → Reviewer**. **Template** (`software` \| `physical` \| `hybrid`) chosen by `classifyProjectTeamTemplate()` before debate. Random names per run via `createSimulationRoster(templateId)` + `team-roster` artifact (`templateId` persisted). |
| DeepSeek | **v4 mixed** — PM/FE/devops/reviewer: `deepseek-v4-flash`; architect + backend: `deepseek-v4-pro`. PM, backend, frontend, devops, reviewer use `DEEPSEEK_CHAT_OPTIONS` (`thinking: disabled`). Architect uses `DEEPSEEK_REASONING_OPTIONS` with `reasoningEffort: "low"`. **Debate turn** output caps and temperature (`ACTIVE_AGENTS` in `src/ai/agents/config.ts`, used directly by `run-simulation.ts`): PM 2200/0.4, AR 3200/0.4, BE 2600/0.35, FE 2200/0.4, DevOps 2200/0.4, RV 2600/0.35. Truncated turn → continuation stream (`looks-like-truncated-agent-output.ts`, up to `TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS`). Empty architect stream → `result.text` fallback, then one flash/chat retry at `max(config.maxOutputTokens * 1.5, 2400)`. [API docs](https://api-docs.deepseek.com) |
| Auth | Custom JWT sessions (`jose`) + `bcryptjs` passwords; guest session cookie; ownership via `Run.userId` / `Run.guestSessionId` — `src/lib/auth/*` |
| Rate limits | Upstash Redis (`@upstash/ratelimit`) on `POST /api/simulate`, `DELETE /api/runs/[id]`, `GET /api/runs/[id]/export/pdf`, `POST /api/export/pdf`, and `POST /api/runs/[id]/artifacts` — `src/lib/rate-limit.ts`; disabled in dev unless `RATE_LIMIT_ENABLED_IN_DEV=true` |
| DB | **Prisma 7** + `prisma.config.ts` + `@prisma/adapter-neon` |
| Prisma client | Generated to `src/generated/prisma` — import from `@/generated/prisma/client` |
| DB access | `src/lib/prisma.ts` (`server-only`) + `src/lib/db/*` helpers |
| Artifacts | Post-debate `generateText` + `Output.object` → `Artifact` rows; types in `src/features/artifacts/schemas.ts`. Guidelines and tab labels vary by `templateId` (`artifact-templates.ts`, `artifact-tab-styles.ts`). |
| Usage / cost | `RunUsageAccumulator` + `src/ai/pricing.ts` — persist `promptTokens`, `completionTokens`, `totalTokens`, `estimatedCostUsd` on `Run` via `setRunUsageTotals()` |
| Styling | Tailwind 4, shadcn, `tw-animate-css`, dark-first tokens |

## Simulation behavior

- **Classification:** `src/ai/orchestration/classify-project.ts` — keyword hybrid pre-check + flash LLM picks template from product idea; fallback `software`.
- **Templates:** `src/ai/agents/team-templates.ts` — same six slot keys, different display titles per template. `physical` uses `src/ai/prompts/physical/`; `hybrid` uses software prompts with **backend → compliance expert** when physical keywords are in the product idea (`prompts/index.ts`).
- **Prompt routing:** `src/ai/prompts/index.ts` — `getAgentSystemPrompt` / `getAgentTurnPrompt` take `templateId` + `productIdea`. DevOps: `devops.ts` (software) / `physical/devops-site.ts`.
- **Language:** Heuristic detection in `src/ai/context/detect-product-language.ts` (English / French / Chinese; Latin-script defaults to English). Directives via `buildLanguageMatchDirective()` in `build-messages.ts`; artifact titles via `ARTIFACT_LANGUAGE_DIRECTIVE` in `generate-run-artifacts.ts`.
- **Debate style:** Dense technical prose with mandatory cross-critique of prior teammates' architectural/library choices (`buildDiscussionDepthRules` in `src/ai/prompts/shared.ts`). Semantic section headings (no hardcoded English `##` titles), no markdown tables. Anti meta-commentary rule in shared depth rules. `[REJECT: role]` routes rejected agent through `buildCorrectionTurnPrompt()` with reviewer feedback excerpt; reviewer re-review via `isReReview` turn prompt. `MAX_SIMULATION_TURNS = 24`. **Architect quality gate:** insufficient software architect output (fewer than 3 `##` sections or &lt;800 chars) → tool-less flash retry, then synthetic reviewer `[REJECT: architect]` + correction turn (`agent-deliverable-quality.ts`). Truncation → up to two continuation streams (`looks-like-truncated-agent-output.ts`, open backticks / bare HTTP status codes).
- **Tools:** `src/ai/tools/registry.ts` — `check_npm_package` (architect), `search_technical_norm` (compliance expert). Max 3 steps per turn (`stopWhen: stepCountIs(3)`).
- **Stream text:** `src/ai/orchestration/agent-stream-text.ts` — strip tool narration / meta-text, normalize headings, buffer architect preambles; reviewer decision parsed from raw text before tag stripping.
- **SSE events:** `run_started`, `team_ready`, `agent_start`, `text-delta`, `tool_start`, `tool_end`, `agent_end`, `artifacts_start`, `done`, `error` — shapes in `src/lib/simulation-stream.ts`. Emit `team_ready` right after classification. Artifact synthesis completes in `/api/simulate` before `done`.
- **Debate outcome UI:** `Run.summary` JSON (`debateOutcome`) → `MockRun.debateOutcome` via `getRunForWorkspace` and `GET /api/runs/[id]/artifacts`. Unapproved outcomes (`cap_reached`, `unknown_reject_fallback`) show an amber banner and subtitle in the artifact panel.
- **Ownership:** `createRun()` stores `userId` or `guestSessionId`. Sidebar, delete, `/runs/[id]`, artifacts GET/POST, and saved-run exports use `buildRunOwnershipWhere()` / `canAccessRun()` / `requireRunAccess()`. `GET /api/runs/[id]/export/pdf` uses `getRunForWorkspaceIfOwned` after `requireRunAccess`.
- **Export:** `exportRunMarkdown()` / `exportRunPdf()` — shared `build-run-export-document.ts` (template-aware labels, parsed debate blocks, usage/outcome); MD client-side (`showSaveFilePicker` + blob); PDF via `md-to-pdf` on server (`GET /api/runs/[id]/export/pdf`, `POST /api/export/pdf` for live runs). **Sign-in required** (guests see `ExportAuthModal`). `GET /api/runs/[id]/export` and PDF routes enforce ownership + rate limits; live PDF POST validates payload volumetry (`export-pdf-payload.ts`).

## Conventions

- Env: `.env.local` at repo root (Prisma CLI loads it via `prisma.config.ts`). Production requires `AUTH_SECRET`; rate limits require Upstash Redis env vars.
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
