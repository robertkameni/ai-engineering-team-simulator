import type { TranscriptEntry } from "@/ai/context/transcript";

const MAX_CONSENSUS_DIRECTIVE_CHARS = 1500;

const CONSENSUS_LINE_PATTERN =
  /\b(defer(?:red|ral)?|v1\.5|v2\b|out of scope|ADR-\d+|replaced with|instead of|removed from v1|not in v1|postponed|descoped)\b/i;

const SCOPE_REVISION_HEADING = /^##\s+(Changes|Correction|Challenging|Refinement|Revision)/im;

export function buildConsensusDirectives(
  transcript: readonly TranscriptEntry[],
): string {
  const lines = extractConsensusLines(transcript);
  if (lines.length === 0) {
    return "";
  }

  const body = truncateLines(lines, MAX_CONSENSUS_DIRECTIVE_CHARS);
  return [
    "## Resolved consensus (authoritative for all artifacts except review disagreements)",
    "",
    "The team debate revised initial proposals. Apply these resolutions over any original PM v1 feature list:",
    "",
    ...body.map((line) => `- ${line}`),
    "",
    "Requirements MUST reflect the revised v1 scope below — not superseded PM proposals when later teammates deferred, removed, or replaced a feature.",
  ].join("\n");
}

function extractConsensusLines(transcript: readonly TranscriptEntry[]): string[] {
  const lineSet = new Set<string>();

  for (const entry of transcript) {
    if (entry.role === "reviewer") {
      continue;
    }

    const contentLines = entry.content.split("\n");
    for (const rawLine of contentLines) {
      const line = rawLine.replace(/^[-*]\s+/, "").trim();
      if (line.length < 20) {
        continue;
      }
      if (CONSENSUS_LINE_PATTERN.test(line)) {
        lineSet.add(line);
      }
    }

    if (SCOPE_REVISION_HEADING.test(entry.content)) {
      const excerpt = entry.content.replace(/\s+/g, " ").trim().slice(0, 240);
      if (excerpt.length >= 40) {
        lineSet.add(`${entry.agentName} (${entry.role}): ${excerpt}`);
      }
    }
  }

  return [...lineSet];
}

function truncateLines(lines: string[], maxChars: number): string[] {
  const result: string[] = [];
  let totalChars = 0;

  for (const line of lines) {
    if (totalChars + line.length > maxChars) {
      break;
    }
    result.push(line);
    totalChars += line.length;
  }

  return result;
}
