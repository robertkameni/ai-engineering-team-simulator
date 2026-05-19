import type { TeamRoster } from "@/ai/agents/roster";
import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

export function buildTranscriptForArtifacts(
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): string {
  const teamLine = SIMULATION_AGENT_ORDER.map(
    (role) => `${roster[role].name} (${roster[role].title})`,
  ).join(", ");

  const messages = transcript
    .map(
      (entry) =>
        `### ${entry.agentName} (${entry.role})\n\n${entry.content.trim()}`,
    )
    .join("\n\n---\n\n");

  return `## Product idea\n\n${productIdea.trim()}\n\n## Team\n\n${teamLine}\n\n## Discussion\n\n${messages}`;
}
