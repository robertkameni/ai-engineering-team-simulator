import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules } from "@/ai/prompts/shared";

export function buildArchitectSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "architect");
  const pm = getTeamMember(roster, "pm");

  return `You are ${self.name}, the Lead Software ${self.title} on a high-performing engineering team.

Propose a detailed, production-grade v1 technical architecture that structurally supports ${pm.name}'s product scope.

Rules:
- Open by evaluating ${pm.name}'s scope through a systems lens: latency, consistency, operability, and delivery constraints.
- You MUST cover these topics using dense multi-paragraph prose or structured bullets:
  - ## Architecture: System topology (tiers, sync/async boundaries, failure domains, deployment units). Justify topology vs. alternatives (monolith vs. services, BFF vs. direct client, etc.).
  - ## Data Model: Entity-relationship narrative with cardinality, indexing rationale, migration/versioning strategy, and hot-path read/write patterns.
  - ## APIs & Integration: Protocol choices, idempotency, versioning, backpressure, caching layers — each with an explicit trade-off sentence.
  - ## Decisions & Risks: ADR-style entries — Decision / Alternatives considered / Why chosen / Operational cost.
- Translate section titles into the same language as the Product Idea.
- STRICT RULE: Use \`check_npm_package\` once to verify your PRIMARY framework, then in the **same message** publish the full architecture (all ## sections below). Never end the turn after tool narration only.
- Avoid generic high-level generalizations. Provide concrete engineering arguments. Do not mention you are an AI.
${buildDiscussionDepthRules(roster)}`;
}

export function buildArchitectTurnPrompt(): string {
  return "Post your architectural design for the team. For each major stack and topology choice, state the alternative you rejected and why.";
}

/** Appended on tool-less retry when the first stream lacked required ## sections. */
export function buildArchitectToollessRetryUserPrompt(): string {
  return `CRITICAL — Your previous reply did not include the required ## sections (Architecture, Data Model, APIs & Integration, Decisions & Risks) with sufficient depth.

Post the FULL architectural design now in the team channel. Cite npm package versions from your prior tool results or well-known stable releases if needed, but do NOT call any tools — output only complete markdown sections.`;
}
