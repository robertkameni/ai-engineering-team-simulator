import type { AgentRole } from "@/lib/types";

export interface TranscriptEntry {
  role: AgentRole;
  agentName: string;
  content: string;
  /** TRUNCATION HANDLING FAILURE GUARD — set when the agent stream was
   * detectably truncated and attempts to continue failed. */
  isTruncated?: boolean;
  /** CORRECTION LOOP FAILURE GUARD — set when a correction turn was
   * validated and found to be insufficient (duplicate or unaddressed). */
  isCorrectionFailed?: boolean;
  /** Human-readable reason when isCorrectionFailed is true. */
  correctionFailureReason?: string;
}
