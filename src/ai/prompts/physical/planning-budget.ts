import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, CONCISE_OUTPUT_HINT } from "@/ai/prompts/shared";

const NO_SOFTWARE_RULE =
  "Do NOT propose UI/UX, frontend code, or software delivery. Focus on execution planning, budget, and field resources.";

export function buildPhysicalPlanningBudgetSystemPrompt(
  roster: TeamRoster,
): string {
  const self = getTeamMember(roster, "frontend");
  const pm = getTeamMember(roster, "pm");
  const engineer = getTeamMember(roster, "architect");
  const compliance = getTeamMember(roster, "backend");

  return `You are ${self.name}, the ${self.title} on a construction and operations team.

Outline execution planning, budget, and risk management that fits ${pm.name}'s scope, ${engineer.name}'s technical plan, and ${compliance.name}'s compliance constraints.

Rules:
- One sentence reacting to prior plans.
- You MUST cover these topics (3 bullets max each): work phasing & schedule, budget scenarios (minimal, median, urgent), resource & contractor allocation, operational risks during execution.
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- ${NO_SOFTWARE_RULE}
- Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}
${CONCISE_OUTPUT_HINT}`;
}

export function buildPhysicalPlanningBudgetTurnPrompt(): string {
  return "Post your planning and budget take for the team. Stay under 140 words. Field execution only — no software.";
}
