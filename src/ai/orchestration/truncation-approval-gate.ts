import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

const CRITICAL_TRUNCATION_ROLES: ReadonlySet<SimulationAgentRole> = new Set([
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

type PostApproveTruncationState = {
  postApproveTruncation: boolean;
  hasTruncatedCriticalTurn: boolean;
  postApproveContinuationFailed: boolean;
  truncationRecoveryAttemptedRoles: SimulationAgentRole[];
};

export type TruncationRecoveryPlan =
  | { readonly kind: "recovered"; }
  | { readonly kind: "schedule"; readonly role: SimulationAgentRole; }
  | { readonly kind: "ship_with_warning"; };

/**
 * Clears post-approve truncation flags when no critical truncation remains.
 * Returns true when cleared (caller should stop truncation recovery).
 */
function clearPostApproveTruncationIfRecovered(
  state: PostApproveTruncationState,
  transcript: readonly TranscriptEntry[],
): boolean {
  syncHasTruncatedCriticalTurn(state, transcript);
  if (hasCurrentCriticalTruncation(transcript)) {
    return false;
  }

  state.postApproveTruncation = false;
  state.hasTruncatedCriticalTurn = false;
  if (state.truncationRecoveryAttemptedRoles.length > 0) {
    state.postApproveContinuationFailed = false;
  }
  return true;
}

/** Sync post-approve truncation flags from the current transcript. */
export function applyPostApproveTruncationFlags(
  state: PostApproveTruncationState,
  transcript: readonly TranscriptEntry[],
): void {
  if (clearPostApproveTruncationIfRecovered(state, transcript)) {
    return;
  }

  state.postApproveTruncation = true;
  state.hasTruncatedCriticalTurn = true;
  if (state.truncationRecoveryAttemptedRoles.length > 0) {
    state.postApproveContinuationFailed = true;
  }
}

/**
 * Shared post-approve truncation recovery planner used by debate convergence
 * and the resolve-reviewer truncation gate.
 */
export function planPostApproveTruncationRecovery(
  state: PostApproveTruncationState,
  transcript: readonly TranscriptEntry[],
  remainingBudget?: number,
): TruncationRecoveryPlan {
  if (clearPostApproveTruncationIfRecovered(state, transcript)) {
    return { kind: "recovered" };
  }

  const truncatedRoles = getLatestTruncatedCriticalRoles(transcript);
  const recoverableRole = truncatedRoles.find(
    (role) => !state.truncationRecoveryAttemptedRoles.includes(role),
  );
  const hasBudget =
    remainingBudget === undefined ? true : remainingBudget >= 1;

  if (recoverableRole && hasBudget) {
    state.truncationRecoveryAttemptedRoles = [
      ...state.truncationRecoveryAttemptedRoles,
      recoverableRole,
    ];
    return { kind: "schedule", role: recoverableRole };
  }

  applyPostApproveTruncationFlags(state, transcript);
  return { kind: "ship_with_warning" };
}
