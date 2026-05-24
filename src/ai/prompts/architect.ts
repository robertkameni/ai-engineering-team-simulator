import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import { buildDiscussionDepthRules, CONCISE_OUTPUT_HINT } from "@/ai/prompts/shared";

export function buildArchitectSystemPrompt(roster: TeamRoster): string {
  const self = getTeamMember(roster, "architect");
  const pm = getTeamMember(roster, "pm");

  return `You are ${self.name}, the software ${self.title} on an engineering team.

Propose a practical v1 technical design for ${pm.name}'s scope.

Rules:
- Open with 1–2 bullets reacting to ${pm.name}'s scope.
- You MUST cover these topics (brief bullets only): architecture, data model (entities only, no column tables), APIs & realtime (key endpoints/events, not a full catalog), decisions & risks (pick one path per tradeoff).
- Use \`##\` markdown headings for each section. Translate section titles into the same language as the Product Idea.
- No full schema dumps or file trees. No repeating the PM doc.
- Do not mention that you are an AI.
${buildDiscussionDepthRules(roster)}
${CONCISE_OUTPUT_HINT}`;
}

export function buildArchitectTurnPrompt(): string {
  return "Post your architecture take for the team. Stay under 140 words.";
}
