import type { TranscriptEntry } from "@/ai/context/transcript";

const CORRECTION_TURN_HEADING = /^##\s+Changes\b/im;

export function isCorrectionTurnContent(content: string): boolean {
  return CORRECTION_TURN_HEADING.test(content.trim());
}

/** Merges delta-only correction turns with the prior message from the same role. */
export function mergeCorrectionTurns(
  transcript: readonly TranscriptEntry[],
): TranscriptEntry[] {
  const merged: TranscriptEntry[] = [];

  for (const entry of transcript) {
    if (entry.role === "reviewer") {
      merged.push(entry);
      continue;
    }

    if (!isCorrectionTurnContent(entry.content)) {
      merged.push(entry);
      continue;
    }

    const priorIndex = findLastIndexByRole(merged, entry.role);
    if (priorIndex === -1) {
      merged.push(entry);
      continue;
    }

    const priorEntry = merged[priorIndex]!;
    merged[priorIndex] = {
      ...entry,
      content: `${priorEntry.content.trim()}\n\n---\n\n${entry.content.trim()}`,
    };
  }

  return merged;
}

function findLastIndexByRole(
  entries: readonly TranscriptEntry[],
  role: TranscriptEntry["role"],
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index]?.role === role) {
      return index;
    }
  }
  return -1;
}
