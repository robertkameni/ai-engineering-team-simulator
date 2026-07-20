import type { TeamRoster } from "@/ai/agents/roster";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  summarizePriorTurns,
  SUMMARIZED_PRIOR_TURNS_MAX_CHARS,
} from "@/ai/context/summarize-prior-turns";

export const TRANSCRIPT_WINDOW_RECENT_COUNT = 6;

export interface WindowedTranscript {
  omittedSummary: string | null;
  entries: TranscriptEntry[];
}

/**
 * Always summarize — including the former "light" path that kept the last 6
 * turns verbatim (subscription v3 stacked multi-10k turns → 420k peak prompt).
 * Correction / re-review / ops-follow-up use the same budget.
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
  _debateContext: DebateTurnContext,
): WindowedTranscript {
  return windowHeavyContextTranscript(transcript, roster);
}

/** Continuation streams: truncated turn + short summary only (no full transcript). */
export function windowTranscriptForContinuation(
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): WindowedTranscript {
  return windowHeavyContextTranscript(transcript, roster);
}
