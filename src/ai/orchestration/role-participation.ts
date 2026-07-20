import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

import { roleHasSpoken } from "@/ai/orchestration/software-early-review";

const PIPELINE_SPEAKING_ROLES = SIMULATION_AGENT_ORDER.filter(
  (role) => role !== "reviewer",
);

export function listMissingPipelineRoles(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole[] {
  return PIPELINE_SPEAKING_ROLES.filter(
    (role) => !roleHasSpoken(transcript, role),
  );
}

export function shouldScheduleMissingRoleFirstTurn(
  rejectRole: SimulationAgentRole,
  transcript: readonly TranscriptEntry[],
): boolean {
  return !roleHasSpoken(transcript, rejectRole);
}

const NEAR_CAP_REMAINING_TURNS = 3;

/**
 * Near the turn cap, prefer inviting silent pipeline roles over burning
 * remaining turns on correction cycles.
 */
export function selectSilentRoleNearCap(params: {
  readonly transcript: readonly TranscriptEntry[];
  readonly turnCount: number;
  readonly maxTurns: number;
  readonly preferDevOps?: boolean;
}): SimulationAgentRole | null {
  const remaining = params.maxTurns - params.turnCount;
  if (remaining < 1) {
    return null;
  }

  const missing = listMissingPipelineRoles(params.transcript);
  if (missing.length === 0) {
    return null;
  }

  if (params.preferDevOps && missing.includes("devops")) {
    return "devops";
  }

  if (remaining <= NEAR_CAP_REMAINING_TURNS) {
    return missing[0] ?? null;
  }

  return null;
}

/**
 * Invite DevOps when operational issues are open or DevOps never spoke
 * and the pipeline has otherwise progressed past Frontend.
 */
export function shouldInviteDevOps(params: {
  readonly transcript: readonly TranscriptEntry[];
  readonly hasUnresolvedOpsIssues: boolean;
  readonly frontendHasSpoken: boolean;
}): boolean {
  if (roleHasSpoken(params.transcript, "devops")) {
    return false;
  }
  if (params.hasUnresolvedOpsIssues) {
    return true;
  }
  return params.frontendHasSpoken;
}

export function canApproveWithFullParticipation(
  transcript: readonly TranscriptEntry[],
): boolean {
  return listMissingPipelineRoles(transcript).length === 0;
}

/** Remaining turns at/under this count count as "near cap" for prefer-approve. */
export const NEAR_CAP_APPROVE_REMAINING_TURNS = 2;

/** Open review issues at/under this count are treated as minor near cap. */
export const NEAR_CAP_APPROVE_MAX_OPEN_ISSUES = 2;

/** Correction feedback excerpt cap when near the turn budget. */
export const NEAR_CAP_FEEDBACK_EXCERPT_MAX_CHARS = 500;

/**
 * Near the turn cap, prefer [APPROVE] over burning remaining turns on
 * correction cycles when every pipeline role has spoken, ops issues are
 * addressed, and only minor open issues remain.
 */
export function shouldPreferNearCapApprove(params: {
  readonly transcript: readonly TranscriptEntry[];
  readonly turnCount: number;
  readonly maxTurns: number;
  readonly openIssueCount: number;
  readonly unresolvedOpsIssueCount?: number;
}): boolean {
  const remaining = params.maxTurns - params.turnCount;
  if (remaining > NEAR_CAP_APPROVE_REMAINING_TURNS) {
    return false;
  }
  if (!canApproveWithFullParticipation(params.transcript)) {
    return false;
  }
  if ((params.unresolvedOpsIssueCount ?? 0) > 0) {
    return false;
  }
  return params.openIssueCount <= NEAR_CAP_APPROVE_MAX_OPEN_ISSUES;
}

/** Alias used by debate telemetry / tests for near-cap forced approve. */
export function forcedApproveNearCap(
  params: Parameters<typeof shouldPreferNearCapApprove>[0],
): boolean {
  return shouldPreferNearCapApprove(params);
}
