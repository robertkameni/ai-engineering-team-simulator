import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import type { TranscriptEntry } from "@/ai/context/transcript";

import { roleHasSpoken } from "@/ai/orchestration/software-early-review";

const PIPELINE_SPEAKING_ROLES = SIMULATION_AGENT_ORDER.filter(
  (role) => role !== "reviewer",
);

/** Roles that must speak at least once before Approved or cap_reached. */
export const REQUIRED_PIPELINE_ROLES = PIPELINE_SPEAKING_ROLES;

export function listMissingPipelineRoles(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole[] {
  return REQUIRED_PIPELINE_ROLES.filter(
    (role) => !roleHasSpoken(transcript, role),
  );
}

export function hasAllPipelineRolesSpoken(
  transcript: readonly TranscriptEntry[],
): boolean {
  return listMissingPipelineRoles(transcript).length === 0;
}

/**
 * When the reviewer rejects a role that has never spoken, schedule that
 * role's first turn instead of entering a correction loop against empty history.
 */
export function routeMissingRoleReject(
  rejectRole: SimulationAgentRole,
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole {
  if (!roleHasSpoken(transcript, rejectRole)) {
    return rejectRole;
  }
  return rejectRole;
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
  return hasAllPipelineRolesSpoken(transcript);
}
