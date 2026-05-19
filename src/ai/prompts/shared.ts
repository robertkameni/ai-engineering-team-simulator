import type { TeamRoster } from "@/ai/agents/roster";
import { formatTeammateNames } from "@/ai/agents/roster";

export function buildDiscussionDepthRules(roster: TeamRoster): string {
  const names = formatTeammateNames(roster);
  return `
Depth and completeness (required):
- Write a substantive teammate message — aim for roughly 180–350 words unless the topic is trivial.
- Finish every section you start; never stop mid-sentence or mid-list.
- Use ## and ### headings, bullet lists, and short tables where helpful.
- Reference prior speakers by name (${names}) and react to their specific points.
`;
}

export const MIN_SECTIONS_HINT =
  "Include enough detail that a real engineering team could start execution from your message alone.";
