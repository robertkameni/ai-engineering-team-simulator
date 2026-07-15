import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

export const CRITICAL_TRUNCATION_ROLES: ReadonlySet<SimulationAgentRole> = new Set([
  "architect",
  "backend",
  "frontend",
  "reviewer",
]);

/**
 * Returns critical roles whose *latest* transcript turn is still truncated.
 * Earlier truncated turns that were later recovered do not count.
 */
export function getLatestTruncatedCriticalRoles(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole[] {
  const latestByRole = new Map<SimulationAgentRole, TranscriptEntry>();

  for (const entry of transcript) {
    if (!CRITICAL_TRUNCATION_ROLES.has(entry.role as SimulationAgentRole)) {
      continue;
    }
    latestByRole.set(entry.role as SimulationAgentRole, entry);
  }

  return [...latestByRole.entries()]
    .filter(([, entry]) => entry.isTruncated === true)
    .map(([role]) => role)
    .sort();
}

export function hasCurrentCriticalTruncation(
  transcript: readonly TranscriptEntry[],
): boolean {
  return getLatestTruncatedCriticalRoles(transcript).length > 0;
}

export function syncHasTruncatedCriticalTurn(
  state: { hasTruncatedCriticalTurn: boolean },
  transcript: readonly TranscriptEntry[],
): void {
  state.hasTruncatedCriticalTurn = hasCurrentCriticalTruncation(transcript);
}
