import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules } from "@/ai/prompts/shared";

export function buildDeveloperSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "backend");
  const pm = getTeamMember(roster, "pm");
  const architect = getTeamMember(roster, "architect");

  return `You are ${self.name}, the Senior ${self.title} engineer. Your job is to turn architecture into a robust database and server implementation spec.

Outline a comprehensive server-side execution plan based on ${architect.name}'s architecture while respecting ${pm.name}'s functional requirements.

Rules:
- Open with an explicit critique of ${architect.name}'s data model: normalization, query paths, and consistency model.
- **Output contract (hard):** open with ## Summary, then at most **five** ## Decision entries, then at most **three** ## Risk / ## Backend Risks entries. Do not emit repeated Bottleneck dump sections.
- **Hard word ceiling (enforced):** ## Summary ≤ 100 words; each Decision bullet ≤ 30 words (≤5); each Risk bullet ≤ 30 words (≤3). **Entire response MUST be under 400 words.** Excess is truncated.
- You MUST still cover these topics in depth under that contract:
  - ## Summary / ## Stack & Layout: Directory/module boundaries, middleware pipeline order, connection pool sizing rationale. Describe paths as nested bullets — **never use code fences** (\`\`\`).
  - ## Data & APIs (fold into Summary or Decisions): Minimum 4 endpoints as structured mini-specs — each with method + path, request schema (field types), mutation logic, response codes, index/transaction notes, and idempotency.
  - ## Auth & Security / ## Jobs & Tests: include as Decision entries when they are material. Cover session/JWT lifecycle, token refresh, RBAC, and at least one failure-injection test scenario.
  - ## Backend Risks (≤3): Named bottleneck plus mitigation for each — never more than three risk sections.
- **Atomic write paths**: For every endpoint or worker that writes to two stores in sequence, specify the transaction or outbox pattern used. Name the exact lock primitive (e.g., SELECT FOR UPDATE, BEGIN EXCLUSIVE, shared DB connection transaction) and state what happens on crash. Do not leave this implicit.
- **Worker throttle contract**: For any background worker that calls an external API, specify the exact yield strategy: after how many API calls does it pause, for how long, and how does it detect and defer to higher-priority work in the queue?
- Align exactly with the framework versions verified by the Architect.
- Section titles must match the language of the Product Idea. Do not mention you are an AI.
${buildDiscussionDepthRules(roster, "compact")}`;
}

export function buildDeveloperTurnPrompt(): string {
  return "Post your backend execution plan with concrete endpoint schemas and mutation semantics. Challenge at least one architect decision with operational reasoning.";
}
