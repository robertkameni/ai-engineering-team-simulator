import type { TeamRoster } from "@/ai/agents/roster";
import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

import { mergeCorrectionTurns } from "@/ai/artifacts/merge-correction-turns";

/** Drops superseded pipeline turns; keeps all reviewer messages. */
export function buildCanonicalTranscriptForArtifacts(
  transcript: TranscriptEntry[],
): TranscriptEntry[] {
  const lastIndexByRole = new Map<string, number>();

  transcript.forEach((entry, index) => {
    if (entry.role === "reviewer") {
      return;
    }
    lastIndexByRole.set(entry.role, index);
  });

  return transcript.filter((entry, index) => {
    if (entry.role === "reviewer") {
      return true;
    }
    return lastIndexByRole.get(entry.role) === index;
  });
}

export function prepareArtifactTranscript(
  transcript: readonly TranscriptEntry[],
): TranscriptEntry[] {
  return buildCanonicalTranscriptForArtifacts(mergeCorrectionTurns(transcript));
}

function buildTranscriptForArtifacts(
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): string {
  const canonicalTranscript = prepareArtifactTranscript(transcript);
  const teamLine = SIMULATION_AGENT_ORDER.map(
    (role) => `${roster[role].name} (${roster[role].title})`,
  ).join(", ");

  const messages = canonicalTranscript
    .map(
      (entry) =>
        `### ${entry.agentName} (${entry.role})\n\n${entry.content.trim()}`,
    )
    .join("\n\n---\n\n");

  return `## Product idea\n\n${productIdea.trim()}\n\n## Team\n\n${teamLine}\n\n## Discussion (canonical — merged corrections, latest message per role)\n\n${messages}`;
}
