import type { TeamRoster } from "@/ai/agents/roster";
import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

import { prepareArtifactTranscript } from "@/ai/artifacts/build-transcript";

/** Max chars for the shared debate summary fed to all artifact generators. */
const COMPRESSED_DEBATE_SUMMARY_MAX_CHARS = 14_000;

const PER_ROLE_EXCERPT_CHARS = 1_800;

function excerpt(content: string, maxChars: number): string {
  const normalized = content.trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

/**
 * One compressed debate summary reused across all artifact generateText calls.
 * Avoids five sequential full-transcript prompts.
 */
export function buildCompressedDebateSummary(
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  options?: { readonly maxChars?: number },
): string {
  const maxChars = options?.maxChars ?? COMPRESSED_DEBATE_SUMMARY_MAX_CHARS;
  const canonical = prepareArtifactTranscript(transcript);
  const teamLine = SIMULATION_AGENT_ORDER.map(
    (role) => `${roster[role].name} (${roster[role].title})`,
  ).join(", ");

  const roleBlocks = canonical.map((entry) => {
    return `### ${entry.agentName} (${entry.role})\n\n${excerpt(entry.content, PER_ROLE_EXCERPT_CHARS)}`;
  });

  let body = [
    `## Product idea\n\n${productIdea.trim()}`,
    `## Team\n\n${teamLine}`,
    `## Discussion (compressed — latest message per role)\n\n${roleBlocks.join("\n\n---\n\n")}`,
  ].join("\n\n");

  if (body.length > maxChars) {
    body = `${body.slice(0, maxChars).trimEnd()}…`;
  }

  return body;
}
