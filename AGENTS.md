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
| Agents | PM → Architect → Backend → Frontend → Reviewer. **Random names per run** via `createSimulationRoster()` + `team-roster` artifact. |
| DeepSeek | **v4 mixed** — PM/FE/reviewer: flash; architect + backend: pro; architect thinking **high**. Output caps: PM/RV 1600, AR 2200, BE/FE 1800. [API docs](https://api-docs.deepseek.com) |
| DB | **Prisma 7** + `prisma.config.ts` + `@prisma/adapter-neon` |
| Prisma client | Generated to `src/generated/prisma` — import from `@/generated/prisma/client` |
| DB access | `src/lib/prisma.ts` (`server-only`) + `src/lib/db/*` helpers |
| Artifacts | Post-debate `generateText` + `Output.object` → `Artifact` rows; types in `src/features/artifacts/schemas.ts` |
| Styling | Tailwind 4, shadcn, `tw-animate-css`, dark-first tokens |

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
