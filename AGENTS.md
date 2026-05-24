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
| Agents | Fixed pipeline slots: PM → Architect → Backend → Frontend → Reviewer. **Template** (`software` \| `physical` \| `hybrid`) chosen by `classifyProjectTeamTemplate()` before debate. Random names per run via `createSimulationRoster(templateId)` + `team-roster` artifact (`templateId` persisted). |
| DeepSeek | **v4 mixed** — PM/FE/reviewer: `deepseek-v4-flash`; architect + backend: `deepseek-v4-pro`. PM, backend, frontend, reviewer use `DEEPSEEK_CHAT_OPTIONS` (`thinking: disabled`). Architect uses `DEEPSEEK_REASONING_OPTIONS` with `reasoningEffort: "low"`. Output caps (tokens): PM 450, AR 650, BE 500, FE 500, RV 450 — see `src/ai/agents/config.ts`. Empty architect stream → `result.text` fallback, then one flash/chat retry in `run-simulation.ts`. [API docs](https://api-docs.deepseek.com) |
| DB | **Prisma 7** + `prisma.config.ts` + `@prisma/adapter-neon` |
| Prisma client | Generated to `src/generated/prisma` — import from `@/generated/prisma/client` |
| DB access | `src/lib/prisma.ts` (`server-only`) + `src/lib/db/*` helpers |
| Artifacts | Post-debate `generateText` + `Output.object` → `Artifact` rows; types in `src/features/artifacts/schemas.ts`. Guidelines and tab labels vary by `templateId` (`artifact-templates.ts`, `artifact-tab-styles.ts`). |
| Styling | Tailwind 4, shadcn, `tw-animate-css`, dark-first tokens |

## Simulation behavior

- **Classification:** `src/ai/orchestration/classify-project.ts` — flash LLM picks template from product idea; fallback `software`.
- **Templates:** `src/ai/agents/team-templates.ts` — same five slot keys, different display titles per template. `physical` uses `src/ai/prompts/physical/`; `hybrid` currently uses software prompts.
- **Prompt routing:** `src/ai/prompts/index.ts` — `getAgentSystemPrompt` / `getAgentTurnPrompt` take `templateId`.
- **Language:** Agents and artifacts match the product idea language (`LANGUAGE_MATCH_DIRECTIVE` in `build-messages.ts`; artifact titles via `ARTIFACT_LANGUAGE_DIRECTIVE`).
- **Debate style:** Short Slack-like turns (~80–140 words), semantic section headings (no hardcoded English `##` titles), no markdown tables — `src/ai/prompts/shared.ts`.
- **SSE events:** `run_started`, `team_ready`, `agent_start`, `text-delta`, `agent_end`, `artifacts_start`, `done`, `error` — shapes in `src/lib/simulation-stream.ts`. Emit `team_ready` right after classification so UI shows correct role titles immediately.

## Conventions

- Env: `.env.local` at repo root (Prisma CLI loads it via `prisma.config.ts`).
- Do not import `@/lib/prisma` or `@/generated/prisma` in client components.
- API routes: `export const runtime = "nodejs"`, `maxDuration` for multi-agent runs.
- Prefer Server Components; client only for stream UI, sidebar pathname, forms.
- Use the latest stable technologies and always follow current best practices.
- Prefer clean, maintainable, and simple solutions.
- Apply D.R.Y. (Don’t Repeat Yourself) and K.I.S.S. principles consistently.
- Avoid over-engineering.
- Write readable and maintainable code.
- Prefer composition over duplication.
- Keep functions and components small and focused.
- Use clear naming conventions.
- Prioritize scalability and performance when relevant.
