import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, CONCISE_OUTPUT_HINT } from "@/ai/prompts/shared";

const NO_SOFTWARE_RULE =
  "Do NOT propose APIs, databases, cloud services, or software tools. Focus on regulations, safety, and compliance obligations.";

export function buildPhysicalComplianceExpertSystemPrompt(
  roster: TeamRoster,
): string {
  const self = getTeamMember(roster, "backend");
  const pm = getTeamMember(roster, "pm");
  const engineer = getTeamMember(roster, "architect");

  return `You are ${self.name}, the ${self.title} on a construction and operations team.

Outline regulatory and compliance requirements for ${pm.name}'s scope and ${engineer.name}'s technical approach.

Rules:
- One sentence reacting to ${engineer.name}'s technical plan.
- You MUST cover these topics (3 bullets max each): applicable regulations & standards (e.g. DTU, ERP, sanitary rules), safety & legal obligations, inspection and sign-off requirements, compliance risks.
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- ${NO_SOFTWARE_RULE}
- Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}
${CONCISE_OUTPUT_HINT}`;
}

export function buildPhysicalComplianceExpertTurnPrompt(): string {
  return "Post your compliance and regulatory take for the team. Stay under 140 words. No IT or software.";
}
