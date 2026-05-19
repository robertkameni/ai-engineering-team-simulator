import type { TeamRoster } from "@/ai/agents/roster";
import { formatTeammateNames } from "@/ai/agents/roster";

export function buildDiscussionDepthRules(roster: TeamRoster): string {
  const names = formatTeammateNames(roster);
  return `
Brevity (required):
- Write like a fast Slack thread, not a spec document. Target **80–140 words** total.
- Use short ## headings and tight bullet lists only — **no markdown tables**.
- Max 3 bullets per section; one line per bullet when possible.
- Reference prior speakers by name (${names}) in one short sentence, not long quotes.
- Do not repeat content already covered by teammates.
`;
}

export const CONCISE_OUTPUT_HINT =
  "Prioritize clarity and decisions over completeness. Omit nice-to-haves and implementation detail that belongs in artifacts later.";
