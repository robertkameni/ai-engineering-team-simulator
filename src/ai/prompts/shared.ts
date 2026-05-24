import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import { formatTeammateNames } from "@/ai/agents/roster";

export function buildDiscussionDepthRules(
  roster: TeamRoster,
  role?: SimulationAgentRole,
): string {
  const names = formatTeammateNames(roster);
  let wordLimit = "80–140 words";
  if (role === "reviewer") wordLimit = "180–220 words";
  if (role === "pm") wordLimit = "160–200 words";
  return `
Brevity (required):
- Write like a fast Slack thread, not a spec document. Target **${wordLimit}** total.
- Use short ## headings and tight bullet lists only — **no markdown tables**.
- Max 3 bullets per section; one line per bullet when possible.
- Reference prior speakers by name (${names}) in one short sentence, not long quotes.
- Do not repeat content already covered by teammates.
- NEVER output meta-commentary about tool usage (e.g., "Let me check...", "Searching for..."). Output only your final response to the team.
`;
}

export const CONCISE_OUTPUT_HINT =
  "Prioritize clarity and decisions over completeness. Omit nice-to-haves and implementation detail that belongs in artifacts later.";

export function buildImplementationQuoteHint(roster: TeamRoster): string {
  return `You MUST include at least one claim from ${roster.backend.name} (${roster.backend.title}) or ${roster.frontend.name} (${roster.frontend.title}) if they have spoken.`;
}
