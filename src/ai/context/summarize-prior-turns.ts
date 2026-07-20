import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";

/** Soft cap for condensed prior-turn context (chars). */
export const SUMMARIZED_PRIOR_TURNS_MAX_CHARS = 12_000;

/** Per-entry excerpt when compressing older turns. */
const PRIOR_TURN_EXCERPT_CHARS = 400;

/** Absolute hard cap for correction feedback. */
const CORRECTION_CONTEXT_HARD_CAP_CHARS = 8_000;

export interface SummarizedPriorTurns {
  readonly omittedSummary: string | null;
  readonly entries: TranscriptEntry[];
  readonly totalChars: number;
}

function buildEntryExcerpt(content: string, maxChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

function buildCompressedSummary(
  omitted: readonly TranscriptEntry[],
  roster: TeamRoster,
): string | null {
  if (omitted.length === 0) {
    return null;
  }

  const lines = omitted.map((entry) => {
    const title = getTeamMember(roster, entry.role).title;
    return `- **${entry.agentName}** (${title}): ${buildEntryExcerpt(entry.content, PRIOR_TURN_EXCERPT_CHARS)}`;
  });

  return [
    "## Earlier debate summary (condensed)",
    "",
    "Older turns are compressed to control prompt size. Prefer the latest verbatim message for decisions.",
    "",
    ...lines,
  ].join("\n");
}

function collectRecentCompressedEntries(
  older: readonly TranscriptEntry[],
  budgetForSummary: number,
): {
  readonly includedFromEnd: TranscriptEntry[];
  readonly dropped: TranscriptEntry[];
} {
  const includedFromEnd: TranscriptEntry[] = [];
  let used = 0;

  for (let index = older.length - 1; index >= 0; index -= 1) {
    const entry = older[index]!;
    const excerpt = buildEntryExcerpt(entry.content, PRIOR_TURN_EXCERPT_CHARS);
    if (used + excerpt.length > budgetForSummary && includedFromEnd.length > 0) {
      break;
    }
    if (used + excerpt.length > budgetForSummary) {
      break;
    }
    includedFromEnd.unshift({ ...entry, content: excerpt });
    used += excerpt.length;
  }

  const droppedCount = older.length - includedFromEnd.length;
  return {
    includedFromEnd,
    dropped: older.slice(0, droppedCount),
  };
}

function buildOmittedSummaryFromParts(
  dropped: readonly TranscriptEntry[],
  includedFromEnd: readonly TranscriptEntry[],
  older: readonly TranscriptEntry[],
  roster: TeamRoster,
): string | null {
  const summaryParts: string[] = [];

  if (dropped.length > 0) {
    const droppedSummary = buildCompressedSummary(dropped, roster);
    if (droppedSummary) {
      summaryParts.push(droppedSummary);
    }
  }

  if (includedFromEnd.length > 0) {
    summaryParts.push(buildCompressedSummary(includedFromEnd, roster) ?? "");
  }

  return (
    summaryParts.filter(Boolean).join("\n\n") ||
    buildCompressedSummary(older, roster)
  );
}

/**
 * Keep the latest turn verbatim; compress older turns into a summary and
 * enforce a hard character budget. Prevents correction/continuation paths
 * from re-sending 30k+ char architect dumps.
 */
export function summarizePriorTurns(
  transcript: readonly TranscriptEntry[],
  roster: TeamRoster,
  options?: {
    readonly maxChars?: number;
  },
): SummarizedPriorTurns {
  const maxChars = options?.maxChars ?? SUMMARIZED_PRIOR_TURNS_MAX_CHARS;

  if (transcript.length === 0) {
    return { omittedSummary: null, entries: [], totalChars: 0 };
  }

  const latest = transcript[transcript.length - 1]!;
  const older = transcript.slice(0, -1);

  if (older.length === 0) {
    return {
      omittedSummary: null,
      entries: [latest],
      totalChars: latest.content.length,
    };
  }

  const budgetForSummary = Math.max(0, maxChars - latest.content.length);
  const { includedFromEnd, dropped } = collectRecentCompressedEntries(
    older,
    budgetForSummary,
  );
  const omittedSummary = buildOmittedSummaryFromParts(
    dropped,
    includedFromEnd,
    older,
    roster,
  );

  return {
    omittedSummary,
    entries: [latest],
    totalChars: (omittedSummary?.length ?? 0) + latest.content.length,
  };
}

/**
 * Diff-style compression for oversized correction feedback.
 * Keeps objection-bearing lines; drops long restated plans.
 */
export function compressCorrectionFeedback(
  feedback: string,
  maxChars = CORRECTION_CONTEXT_HARD_CAP_CHARS,
): string {
  const trimmed = feedback.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const lines = trimmed.split("\n");
  const priority = lines.filter((line) =>
    /reject|missing|unresolved|must|gap|risk|incomplete|fix|required/i.test(
      line,
    ),
  );
  const selected = priority.length > 0 ? priority : lines;
  const joined = selected.join("\n").trim();

  if (joined.length <= maxChars) {
    return joined;
  }

  return `${joined.slice(0, maxChars).trimEnd()}…`;
}
