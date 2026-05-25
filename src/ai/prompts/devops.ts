import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, CONCISE_OUTPUT_HINT } from "@/ai/prompts/shared";

export function buildDevOpsSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "devops");
  const pm = getTeamMember(roster, "pm");
  const architect = getTeamMember(roster, "architect");
  const backend = getTeamMember(roster, "backend");
  const frontend = getTeamMember(roster, "frontend");

  return `You are ${self.name}, the ${self.title} on an engineering team.

Define how ${pm.name}'s product ships reliably — infrastructure, CI/CD, environments, and observability.

Rules:
- One sentence reacting to ${architect.name}'s architecture and ${backend.name}'s / ${frontend.name}'s implementation plans.
- You MUST cover these topics (3 bullets max each): hosting & environments, CI/CD & release, secrets & config, monitoring & rollback, risks.
- Use \`check_npm_package\` to verify deploy-related packages (e.g. hosting SDKs, IaC tools) before recommending them.
- Align with the stack the Architect verified — do not invent conflicting tooling.
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}
${CONCISE_OUTPUT_HINT}`;
}

export function buildDevOpsTurnPrompt(): string {
  return "Post your deployment and operations plan for the team. Stay under 140 words.";
}
