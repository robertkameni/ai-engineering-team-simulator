import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { getTeamMember } from "@/ai/agents/roster";
import { resolveDebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  buildArchitectInsufficientReviewerFeedback,
  isArchitectDeliverableInsufficient,
} from "@/ai/orchestration/agent-deliverable-quality";
import { normalizeAgentPersistedText } from "@/ai/orchestration/agent-stream-text";
import { normalizeSectionDumpOutput } from "@/ai/orchestration/section-dump-normalizer";
import {
  detectPeerCriticism,
  hasAnySubstantiveDisagreement,
} from "@/ai/orchestration/peer-criticism-detector";
import {
  getMaxSimulationTurns,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import {
  markIssuesAttempted,
  markIssuesFailedValidation,
} from "@/ai/orchestration/review-issue-tracker";
import { resolveReviewerOutcome } from "@/ai/orchestration/resolve-reviewer-outcome";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import {
  getLatestTruncatedCriticalRoles,
  syncHasTruncatedCriticalTurn,
} from "@/ai/orchestration/truncation-approval-gate";
import {
  validateCorrectionTurn,
  type CorrectionValidationResult,
} from "@/ai/orchestration/validate-correction-turn";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { appendMessage, touchRunActivity } from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { assertNotAborted, isSimulationAborted } from "./simulation-abort";
import {
  normalizeMangledReviewerDecisionText,
  parseReviewerDecisionWithMangleRecovery,
} from "./normalize-mangled-decision-tag";
import { recoverReviewerDecisionTag } from "./recover-reviewer-decision-tag";
import { resolveOpsIssueDispositions } from "./ops-issue-disposition";
import { streamAgentTurn } from "./stream-agent-turn";
import type { StreamAgentTurnResult } from "./stream-agent-turn";
import type {
  DebateState,
  TurnContext,
  TurnDirective,
} from "./run-simulation-types";

const AGENT_TURN_FALLBACK = "[Tool Error: Agent failed to respond]";
const NEAR_CAP_REMAINING_TURNS = 2;
const CRITICAL_ROLES: ReadonlySet<SimulationAgentRole> = new Set([
  "architect",
  "backend",
  "frontend",
  "reviewer",
]);

type ExecutedTurn =
  | { kind: "break"; outcome: "reviewer_error" }
  | { kind: "text"; fullText: string; wasTruncated: boolean };

export async function runDebateTurn(
  state: DebateState,
  ctx: TurnContext,
): Promise<TurnDirective> {
  const role = state.nextRole;

  await touchRunActivity(ctx.runId);
  assertNotAborted(ctx.abortSignal);

  const member = getTeamMember(ctx.roster, role);
  const debateContext = resolveDebateTurnContext(
    role,
    state.transcript,
    ctx.roster,
    state.lastRejectTarget,
    state.lastRejectFeedback,
    {
      nearCapCorrection:
        getMaxSimulationTurns(ctx.templateId) - state.turnCount <=
        NEAR_CAP_REMAINING_TURNS,
      reviewIssues: state.reviewIssues,
    },
  );

  enrichDebateContext(role, state, ctx, debateContext);

  if (state.truncationRecoveryAttemptedRoles.includes(role)) {
    debateContext.truncationRewrite = true;
  }

  const turnResult = await executeDebateTurn(
    role,
    member.name,
    member.title,
    debateContext,
    state.transcript,
    ctx,
    { disableTools: state.isArchitectRevision },
  );
  if (turnResult.kind === "break") {
    return turnResult;
  }

  let fullText = turnResult.fullText;
  assertSimulationWithinBudget(ctx.usageAccumulator);
  fullText = await recoverUnknownReviewerTag(role, fullText, ctx);

  const normalizedText =
    role === "reviewer"
      ? stripReviewerDecisionTag(normalizeAgentPersistedText(role, fullText))
      : normalizeAgentPersistedText(role, fullText);
  const normalizedOutput = normalizeSectionDumpOutput(normalizedText);
  const contentToPersist = normalizedOutput.content;
  state.outputDiagnostics = normalizedOutput.diagnostics;

  const gateDirective = await handleArchitectQualityGate(
    role,
    contentToPersist,
    fullText,
    ctx,
    state,
  );
  if (gateDirective) {
    return gateDirective;
  }

  const correctionValidation = validateCorrectionIfNeeded(
    state,
    ctx,
    role,
    debateContext,
    contentToPersist,
  );
  markDevOpsIssuesIfNeeded(state, role, contentToPersist);

  await persistTurn(
    role,
    contentToPersist,
    member.name,
    ctx,
    state,
    turnResult.wasTruncated,
    correctionValidation,
  );

  clearPostTurnFlags(state, role);
  handleFailedCorrectionState(state, ctx, role, debateContext, correctionValidation);
  return resolveReviewerOutcome(role, fullText, state, ctx);
}

function enrichDebateContext(
  role: SimulationAgentRole,
  state: DebateState,
  ctx: TurnContext,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
): void {
  if (role === "reviewer") {
    const agentNames = SIMULATION_AGENT_ORDER.map(
      (pipelineRole) => getTeamMember(ctx.roster, pipelineRole).name,
    );
    debateContext.hasTeamDisagreement = hasAnySubstantiveDisagreement(
      state.transcript,
      agentNames,
    );
    return;
  }

  if (role === "architect" && state.isArchitectRevision) {
    const architect = getTeamMember(ctx.roster, "architect");
    const critics: SimulationAgentRole[] = ["backend", "frontend", "devops"];
    const criticism = detectPeerCriticism(
      state.transcript,
      architect.name,
      critics,
    );
    debateContext.architectRevisionCritiques = criticism.excerpts;
  }

  if (role === "devops" && state.focusedOpsFollowUp) {
    debateContext.focusedOpsFollowUp = state.focusedOpsFollowUp;
  }
}

function validateCorrectionIfNeeded(
  state: DebateState,
  ctx: TurnContext,
  role: SimulationAgentRole,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
  contentToPersist: string,
): CorrectionValidationResult | null {
  if (!debateContext.correction) {
    return null;
  }

  const targetRole = debateContext.correction.targetRole;
  markIssuesAttempted(state.reviewIssues, targetRole, state.turnCount);

  const previousEntry = findLastTranscriptEntry(state.transcript, targetRole);
  if (!previousEntry) {
    return null;
  }

  const feedback = state.lastRejectFeedback ?? "";
  const correctionValidation = validateCorrectionTurn(
    previousEntry.content,
    contentToPersist,
    feedback,
    targetRole,
  );

  if (!correctionValidation.isValid) {
    console.warn(
      `CORRECTION LOOP FAILURE: ${role} correction rejected by validation gate`,
      {
        runId: ctx.runId,
        role,
        failureReason: correctionValidation.failureReason,
        textSimilarity: correctionValidation.textSimilarity.toFixed(2),
      },
    );
    markIssuesFailedValidation(state.reviewIssues, targetRole);
  }

  return correctionValidation;
}

function markDevOpsIssuesIfNeeded(
  state: DebateState,
  role: SimulationAgentRole,
  contentToPersist: string,
): void {
  if (!state.focusedOpsFollowUp || role !== "devops") {
    return;
  }

  resolveOpsIssueDispositions(state.reviewIssues, contentToPersist, state.turnCount);
}

function clearPostTurnFlags(
  state: DebateState,
  role: SimulationAgentRole,
): void {
  if (state.isArchitectRevision) {
    state.isArchitectRevision = false;
  }

  if (role === "devops" && state.focusedOpsFollowUp) {
    state.focusedOpsFollowUp = null;
  }
}

function handleFailedCorrectionState(
  state: DebateState,
  ctx: TurnContext,
  role: SimulationAgentRole,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
  correctionValidation: CorrectionValidationResult | null,
): void {
  if (!debateContext.correction || !correctionValidation || correctionValidation.isValid) {
    return;
  }

  console.warn(
    `CORRECTION LOOP FAILURE: preserving reviewer proposal after failed ${role} correction`,
    {
      runId: ctx.runId,
      role,
      failureReason: correctionValidation.failureReason,
    },
  );
}

async function executeDebateTurn(
  role: SimulationAgentRole,
  name: string,
  title: string,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
  transcript: TranscriptEntry[],
  ctx: TurnContext,
  options?: { disableTools?: boolean },
): Promise<ExecutedTurn> {
  try {
    const result: StreamAgentTurnResult = await streamAgentTurn({
      runId: ctx.runId,
      role,
      productIdea: ctx.productIdea,
      transcript,
      roster: ctx.roster,
      templateId: ctx.templateId,
      usageAccumulator: ctx.usageAccumulator,
      abortSignal: ctx.abortSignal,
      debateContext,
      send: ctx.notify,
      disableTools: options?.disableTools,
    });
    return { kind: "text", fullText: result.text, wasTruncated: result.wasTruncated };
  } catch (turnError) {
    if (isSimulationAborted(turnError) || isSimulationBudgetExceeded(turnError)) {
      throw turnError;
    }

    if (role === "reviewer") {
      console.error("Reviewer turn failed, closing debate:", turnError);
      return { kind: "break", outcome: "reviewer_error" };
    }

    console.error(`Agent turn failed (${role}):`, turnError);
    emitFallbackAgentTurn(role, name, title, AGENT_TURN_FALLBACK, ctx.notify);
    return { kind: "text", fullText: AGENT_TURN_FALLBACK, wasTruncated: false };
  }
}

async function recoverUnknownReviewerTag(
  role: SimulationAgentRole,
  fullText: string,
  ctx: TurnContext,
): Promise<string> {
  if (role !== "reviewer") {
    return fullText;
  }

  const normalizedText = normalizeMangledReviewerDecisionText(fullText, ctx.roster);
  const parsed = parseReviewerDecisionWithMangleRecovery(normalizedText, ctx.roster);
  if (parsed.decision !== "unknown") {
    return normalizedText;
  }

  const recoveredTag = await recoverReviewerDecisionTag(normalizedText, {
    usageAccumulator: ctx.usageAccumulator,
    abortSignal: ctx.abortSignal,
  });
  if (recoveredTag) {
    assertSimulationWithinBudget(ctx.usageAccumulator);
    return `${normalizedText.trimEnd()}\n\n${recoveredTag}`;
  }

  assertSimulationWithinBudget(ctx.usageAccumulator);
  return normalizedText;
}

async function handleArchitectQualityGate(
  role: SimulationAgentRole,
  contentToPersist: string,
  fullText: string,
  ctx: TurnContext,
  state: DebateState,
): Promise<TurnDirective | null> {
  if (role !== "architect") {
    return null;
  }
  if (!isArchitectDeliverableInsufficient(contentToPersist, ctx.templateId)) {
    return null;
  }

  console.warn(
    "Architect deliverable still insufficient — synthetic [REJECT: architect]",
    { runId: ctx.runId },
  );

  const reviewerMember = getTeamMember(ctx.roster, "reviewer");
  const rejectFeedback = buildArchitectInsufficientReviewerFeedback(
    contentToPersist,
    ctx.templateId,
  );
  const rejectRaw = `${rejectFeedback}\n\n[REJECT: architect]`;
  const rejectPersisted = stripReviewerDecisionTag(
    normalizeAgentPersistedText("reviewer", rejectRaw),
  );

  state.transcript.push({
    role: "reviewer",
    agentName: reviewerMember.name,
    content: rejectPersisted,
  });
  await appendMessage(
    ctx.runId,
    "reviewer",
    rejectPersisted,
    state.transcript.length - 1,
    reviewerMember.name,
  );
  state.turnCount += 1;

  return resolveReviewerOutcome("reviewer", rejectRaw, state, ctx);
}

async function persistTurn(
  role: SimulationAgentRole,
  contentToPersist: string,
  agentName: string,
  ctx: TurnContext,
  state: DebateState,
  wasTruncated = false,
  correctionValidation?: CorrectionValidationResult | null,
): Promise<void> {
  if (wasTruncated && CRITICAL_ROLES.has(role)) {
    console.warn(
      `TRUNCATION APPROVAL GUARD: critical role ${role} turn was truncated`,
      { runId: ctx.runId, role, turnCount: state.turnCount },
    );
  }

  state.transcript.push({
    role,
    agentName,
    content: contentToPersist,
    isTruncated: wasTruncated || undefined,
    isCorrectionFailed: correctionValidation
      ? !correctionValidation.isValid || undefined
      : undefined,
    correctionFailureReason: correctionValidation?.failureReason || undefined,
  });

  syncHasTruncatedCriticalTurn(state, state.transcript);

  await appendMessage(
    ctx.runId,
    role,
    contentToPersist,
    state.transcript.length - 1,
    agentName,
  );

  state.turnCount += 1;
}

function findLastTranscriptEntry(
  transcript: TranscriptEntry[],
  role: SimulationAgentRole,
): TranscriptEntry | undefined {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index]?.role === role) {
      return transcript[index];
    }
  }
  return undefined;
}

function emitFallbackAgentTurn(
  role: SimulationAgentRole,
  name: string,
  title: string,
  content: string,
  send: (event: SimulationStreamEvent) => void,
): void {
  send({ type: "agent_start", role, name, title });
  send({ type: "text-delta", role, delta: content });
  send({ type: "agent_end", role });
}
