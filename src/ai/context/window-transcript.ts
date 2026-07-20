import type { TeamRoster } from "@/ai/agents/roster";
import { getTeamMember } from "@/ai/agents/roster";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  summarizePriorTurns,
  SUMMARIZED_PRIOR_TURNS_MAX_CHARS,
} from "@/ai/context/summarize-prior-turns";

export const TRANSCRIPT_WINDOW_RECENT_COUNT = 6;
export const TRANSCRIPT_SUMMARY_EXCERPT_CHARS = 280;

export interface WindowedTranscript {
  omittedSummary: string | null;
  entries: TranscriptEntry[];
}

export function shouldUseFullTranscript(debateContext: DebateTurnContext): boolean {
  return Boolean(
    debateContext.correction ||
    debateContext.focusedOpsFollowUp ||
    debateContext.isReReview ||
    (debateContext.architectRevisionCritiques?.length ?? 0) > 0,
  );
}

function buildEntryExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= TRANSCRIPT_SUMMARY_EXCERPT_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, TRANSCRIPT_SUMMARY_EXCERPT_CHARS).trimEnd()}…`;
}

export function buildOmittedTranscriptSummary(
  omitted: readonly TranscriptEntry[],
  roster: TeamRoster,
): string {
  const lines = omitted.map((entry) => {
    const title = getTeamMember(roster, entry.role).title;
    return `- **${entry.agentName}** (${title}): ${buildEntryExcerpt(entry.content)}`;
  });

  return [
    "## Earlier debate summary (condensed)",
    "",
    "The following teammates spoke before the recent messages. Use this for context; details may be abbreviated.",
    "",
    ...lines,
  ].join("\n");
}

/**
 * Correction / re-review / ops-follow-up paths previously sent the full
 * transcript (31k–42k char architect dumps). Always summarize those paths.
 */
function windowHeavyContextTranscript(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): WindowedTranscript {
  const summarized = summarizePriorTurns(transcript, roster, {
    maxChars: SUMMARIZED_PRIOR_TURNS_MAX_CHARS,
  });
  return {
    omittedSummary: summarized.omittedSummary,
    entries: summarized.entries,
  };
}

export function windowTranscriptForTurn(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  debateContext: DebateTurnContext,
): WindowedTranscript {
  if (shouldUseFullTranscript(debateContext)) {
    return windowHeavyContextTranscript(transcript, roster);
  }

  if (transcript.length <= TRANSCRIPT_WINDOW_RECENT_COUNT) {
    return { omittedSummary: null, entries: transcript };
  }

  const omitted = transcript.slice(0, -TRANSCRIPT_WINDOW_RECENT_COUNT);
  const recent = transcript.slice(-TRANSCRIPT_WINDOW_RECENT_COUNT);

  return {
    omittedSummary: buildOmittedTranscriptSummary(omitted, roster),
    entries: recent,
  };
}

/** Continuation streams: truncated turn + short summary only (no full transcript). */
export function windowTranscriptForContinuation(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): WindowedTranscript {
  return windowHeavyContextTranscript(transcript, roster);
}
