import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import type { SimulationAgentRole } from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";

import { parseDeepFocusTags } from "@/ai/orchestration/deep-focus-tags";
import { inferIssueOwnerFromConcern } from "@/ai/orchestration/issue-ownership";
import { parseReviewerDecisionWithMangleRecovery } from "@/ai/orchestration/normalize-mangled-decision-tag";
import { extractUnresolvedProseCriticalRisks } from "@/ai/orchestration/prose-critical-risks";

const PIPELINE_ROLES = SIMULATION_AGENT_ORDER.filter(
  (role) => role !== "reviewer",
);

const UNVERIFIED_CLAIM =
  /\b(tested|verified|automated|already in place)\b/i;
const OPERATIONAL_NOUN =
  /\b(backup|restore|drill|canary|alert(?:ing)?)\b/i;

const MISSING_CHALLENGE_TOKEN = "missing-challenge";
const UNVERIFIED_CLAIM_TOKEN = "unverified-claim";

export type DeepFocusViolationKind =
  | "missing_challenge"
  | "unverified_claim"
  | "approve_with_blocked"
  | "approve_with_unresolved_critical";

export interface DeepFocusEvaluation {
  readonly violations: readonly DeepFocusViolationKind[];
  readonly rejectRole: SimulationAgentRole | null;
}

export interface EvaluateDeepFocusTurnParams {
  readonly role: SimulationAgentRole;
  readonly text: string;
  readonly transcript: readonly TranscriptEntry[];
  readonly roster: TeamRoster;
  readonly isCorrection?: boolean;
}

function spokenPipelineRoles(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole[] {
  const spoken = new Set<SimulationAgentRole>();
  for (const entry of transcript) {
    if (entry.role !== "reviewer" && PIPELINE_ROLES.includes(entry.role)) {
      spoken.add(entry.role);
    }
  }
  return PIPELINE_ROLES.filter((role) => spoken.has(role));
}

function lastSpokenPipelineRole(
  transcript: readonly TranscriptEntry[],
): SimulationAgentRole | null {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const role = transcript[index]?.role;
    if (role && role !== "reviewer" && PIPELINE_ROLES.includes(role)) {
      return role;
    }
  }
  return null;
}

function hasUnverifiedOperationalClaim(text: string): boolean {
  return UNVERIFIED_CLAIM.test(text) && OPERATIONAL_NOUN.test(text);
}

function shouldRequireChallenge(params: EvaluateDeepFocusTurnParams): boolean {
  if (params.role === "reviewer" || params.isCorrection) {
    return false;
  }

  const priorRoles = spokenPipelineRoles(params.transcript).filter(
    (role) => role !== params.role,
  );
  return priorRoles.length > 0;
}

function resolveRejectRole(params: EvaluateDeepFocusTurnParams): SimulationAgentRole {
  const tags = parseDeepFocusTags(params.text, params.roster);
  const blockedBlob = tags.blocked.join(" ");
  if (blockedBlob) {
    return inferIssueOwnerFromConcern(blockedBlob, params.roster, "devops");
  }

  const proseRisks = extractUnresolvedProseCriticalRisks(
    params.text,
    params.roster,
    params.role === "reviewer" ? "devops" : params.role,
  );
  if (proseRisks[0]) {
    return proseRisks[0].targetRole;
  }

  return lastSpokenPipelineRole(params.transcript) ?? "architect";
}

export function evaluateDeepFocusTurn(
  params: EvaluateDeepFocusTurnParams,
): DeepFocusEvaluation {
  const tags = parseDeepFocusTags(params.text, params.roster);
  const violations: DeepFocusViolationKind[] = [];

  if (shouldRequireChallenge(params)) {
    const spokenTargets = spokenPipelineRoles(params.transcript).filter(
      (role) => role !== params.role,
    );
    const hasValidChallenge = tags.challenges.some((role) =>
      spokenTargets.includes(role),
    );
    if (!hasValidChallenge) {
      violations.push("missing_challenge");
    }
  }

  if (
    params.role !== "reviewer" &&
    hasUnverifiedOperationalClaim(params.text) &&
    tags.evidence.length === 0 &&
    tags.blocked.length === 0
  ) {
    violations.push("unverified_claim");
  }

  if (params.role === "reviewer") {
    const parsed = parseReviewerDecisionWithMangleRecovery(
      params.text,
      params.roster,
    );
    if (parsed.decision === "approve") {
      if (tags.blocked.length > 0) {
        violations.push("approve_with_blocked");
      }
      const proseRisks = extractUnresolvedProseCriticalRisks(
        params.text,
        params.roster,
        "devops",
      );
      if (proseRisks.length > 0) {
        violations.push("approve_with_unresolved_critical");
      }
    }
  }

  const shouldReject =
    violations.includes("approve_with_blocked") ||
    violations.includes("approve_with_unresolved_critical");

  return {
    violations,
    rejectRole: shouldReject ? resolveRejectRole(params) : null,
  };
}

export function rewriteApproveToReject(
  text: string,
  targetRole: SimulationAgentRole,
): string {
  const rejectTag = `[REJECT: ${targetRole}]`;
  const lastApprove = text.lastIndexOf("[APPROVE]");
  if (lastApprove === -1) {
    return `${text.trimEnd()}\n\n${rejectTag}`;
  }
  return `${text.slice(0, lastApprove)}${rejectTag}${text.slice(lastApprove + "[APPROVE]".length)}`;
}

export function stampDeepFocusFallback(
  content: string,
  violations: readonly DeepFocusViolationKind[],
  roster?: TeamRoster,
): string {
  const tags = parseDeepFocusTags(content, roster);
  const stamps: string[] = [];

  if (
    violations.includes("missing_challenge") &&
    tags.challenges.length === 0 &&
    !tags.blocked.includes(MISSING_CHALLENGE_TOKEN)
  ) {
    stamps.push(`[BLOCKED: ${MISSING_CHALLENGE_TOKEN}]`);
  }

  if (
    violations.includes("unverified_claim") &&
    tags.evidence.length === 0 &&
    tags.blocked.length === 0
  ) {
    stamps.push(`[BLOCKED: ${UNVERIFIED_CLAIM_TOKEN}]`);
  }

  if (stamps.length === 0) {
    return content;
  }

  return `${content.trimEnd()}\n\n${stamps.join("\n")}`;
}

export function applyDeepFocusEnforcement(params: EvaluateDeepFocusTurnParams): {
  readonly decisionText: string;
  readonly evaluation: DeepFocusEvaluation;
} {
  const evaluation = evaluateDeepFocusTurn(params);
  if (!evaluation.rejectRole) {
    return { decisionText: params.text, evaluation };
  }

  return {
    decisionText: rewriteApproveToReject(params.text, evaluation.rejectRole),
    evaluation,
  };
}

export function buildDeepFocusContinuationPrompt(
  violations: readonly DeepFocusViolationKind[],
): string | null {
  const needsTags = violations.some(
    (violation) =>
      violation === "missing_challenge" || violation === "unverified_claim",
  );
  if (!needsTags) {
    return null;
  }

  return [
    "DEEP-FOCUS GATE — append the missing machine tags only. Do not rewrite the plan.",
    "Use a role slug (pm|architect|backend|frontend|devops) or the teammate's display name.",
    violations.includes("missing_challenge")
      ? "- Add one `[CHALLENGE: role]` or `[CHALLENGE: Name]` targeting a teammate who already spoke."
      : "",
    violations.includes("unverified_claim")
      ? "- Add `[EVIDENCE: mechanism]` (job, test, or drill name) or `[BLOCKED: topic]` for the unverified backup/restore/alert claim."
      : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

export function needsDeepFocusTagRetry(
  violations: readonly DeepFocusViolationKind[],
): boolean {
  return buildDeepFocusContinuationPrompt(violations) !== null;
}

export function mergeDeepFocusTagContinuation(
  base: string,
  continuation: string,
  roster?: TeamRoster,
): string {
  const baseTags = parseDeepFocusTags(base, roster);
  const nextTags = parseDeepFocusTags(continuation, roster);
  const stamps: string[] = [];

  for (const role of nextTags.challenges) {
    if (!baseTags.challenges.includes(role)) {
      stamps.push(`[CHALLENGE: ${role}]`);
    }
  }
  for (const token of nextTags.evidence) {
    if (
      !baseTags.evidence.some(
        (existing) => existing.toLowerCase() === token.toLowerCase(),
      )
    ) {
      stamps.push(`[EVIDENCE: ${token}]`);
    }
  }
  for (const token of nextTags.blocked) {
    if (
      !baseTags.blocked.some(
        (existing) => existing.toLowerCase() === token.toLowerCase(),
      )
    ) {
      stamps.push(`[BLOCKED: ${token}]`);
    }
  }

  if (stamps.length === 0) {
    return base;
  }

  return `${base.trimEnd()}\n\n${stamps.join(" ")}`;
}
