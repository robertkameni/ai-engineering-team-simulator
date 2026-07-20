import {
  SIMULATION_AGENT_ORDER,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import { resolveDebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  canCorrectRole,
  incrementRoleCorrectionCount,
} from "@/ai/orchestration/debate-correction-caps";
import { classifyProjectTeamTemplate } from "@/ai/orchestration/classify-project";
import {
  buildArchitectInsufficientReviewerFeedback,
  isArchitectDeliverableInsufficient,
} from "@/ai/orchestration/agent-deliverable-quality";
import { normalizeAgentPersistedText } from "@/ai/orchestration/agent-stream-text";
import {
  assertSimulationWithinBudget,
  isSimulationBudgetExceeded,
} from "@/ai/orchestration/simulation-budget";
import { recoverReviewerDecisionTag } from "@/ai/orchestration/recover-reviewer-decision-tag";
import {
  detectPeerCriticism,
  hasAnySubstantiveDisagreement,
} from "@/ai/orchestration/peer-criticism-detector";
import {
  type DebateExitOutcome,
  hasExceededReviewerRejectionCap,
  canScheduleArchitectRevision,
  getMaxSimulationTurns,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import {
  normalizeMangledReviewerDecisionText,
  parseReviewerDecisionWithMangleRecovery,
} from "@/ai/orchestration/normalize-mangled-decision-tag";
import {
  markIssuesAttempted,
  markIssuesFailedValidation,
  buildIssueSnapshot,
} from "@/ai/orchestration/review-issue-tracker";
import { syncHasTruncatedCriticalTurn } from "@/ai/orchestration/truncation-approval-gate";
import {
  selectSilentRoleNearCap,
  shouldInviteDevOps,
  shouldPreferNearCapApprove,
  NEAR_CAP_APPROVE_REMAINING_TURNS,
} from "@/ai/orchestration/role-participation";
import { shouldTriggerSoftwareEarlyReview as shouldTriggerSoftwareEarlyReviewGate } from "@/ai/orchestration/software-early-review";
import { resolveReviewerOutcome } from "@/ai/orchestration/resolve-reviewer-outcome";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { buildRunSummaryPayload } from "@/lib/db/run-summary";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  appendMessage,
  createRun,
  setRunUsageTotals,
  touchRunActivity,
  updateRunSummary,
} from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { assertNotAborted, isSimulationAborted } from "./simulation-abort";
import { streamAgentTurn } from "./stream-agent-turn";
import type { StreamAgentTurnResult } from "./stream-agent-turn";
import {
  markDevOpsOperationalIssuesAttempted,
  scheduleOpsFollowUpTurn,
  recordOpsFollowUpCheckpoint,
  selectOpsFollowUpSummary,
  getUnresolvedDevOpsIssues,
} from "@/ai/orchestration/ops-follow-up";
import { opsFollowUpFieldsFromCheckpoint } from "@/lib/db/ops-follow-up-summary";
import {
  validateCorrectionTurn,
  type CorrectionValidationResult,
} from "@/ai/orchestration/validate-correction-turn";
import type {
  DebateState,
  RunSimulationOptions,
  RunSimulationResult,
  TurnContext,
  TurnDirective,
} from "./run-simulation-types";

export { isSimulationAborted } from "./simulation-abort";
export type { RunSimulationOptions, RunSimulationResult } from "./run-simulation-types";

const AGENT_TURN_FALLBACK = "[Tool Error: Agent failed to respond]";

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
  options: RunSimulationOptions = {},
): Promise<RunSimulationResult> {
  const usageAccumulator =
    options.usageAccumulator ?? new RunUsageAccumulator();
  const abortSignal = options.abortSignal;
  const run = await createRun(productIdea, {
    userId: options.userId,
    guestSessionId: options.guestSessionId,
  });

  let debateComplete = false;
  let artifactPhaseStarted = false;

  try {
    assertNotAborted(abortSignal);

    const classification = await classifyProjectTeamTemplate(
      productIdea,
      usageAccumulator,
    );
    assertSimulationWithinBudget(usageAccumulator);
    const roster = createSimulationRoster(classification.templateId);
    await saveTeamRoster(run.id, roster);
    await touchRunActivity(run.id);

    const notify = buildNotifyHandler(send, run.id);

    notify({ type: "run_started", runId: run.id });
    notify({
      type: "team_ready",
      templateId: classification.templateId,
      members: SIMULATION_AGENT_ORDER.map((role) => {
        const member = getTeamMember(roster, role);
        return { role, name: member.name, title: member.title };
      }),
    });

    const state: DebateState = {
      turnCount: 0,
      roleIndex: 0,
      returnToReviewer: false,
      nextRole: SIMULATION_AGENT_ORDER[0],
      lastRejectFeedback: null,
      lastRejectTarget: null,
      reviewerRejectionCount: 0,
      roleCorrectionCounts: {},
      transcript: [],
      isArchitectRevision: false,
      hasTruncatedCriticalTurn: false,
      postApproveTruncation: false,
      postApproveContinuationFailed: false,
      truncationRecoveryAttemptedRoles: [],
      reviewIssues: [],
      isGateReroute: false,
      hasHadEarlyReview: false,
      hasHadOpsFollowUpForCurrentReject: false,
      focusedOpsFollowUp: null,
      opsFollowUpCheckpoint: null,
      opsFollowUpCheckpoints: [],
      consecutiveUnproductiveCycles: 0,
      correctionLoopDetected: false,
    };

    const ctx: TurnContext = {
      runId: run.id,
      productIdea,
      roster,
      templateId: classification.templateId,
      usageAccumulator,
      abortSignal,
      notify,
    };

    const debateStartedAt = Date.now();
    const debateExitOutcome = await runDebateLoop(state, ctx);
    const debateDurationMs = Date.now() - debateStartedAt;

    assertNotAborted(abortSignal);

    debateComplete = true;

    const usageTotals = usageAccumulator.getTotals();
    const opsFollowUpSummary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);
    const architectCheckpoint =
      opsFollowUpSummary.relevantArchitect !== opsFollowUpSummary.last
        ? opsFollowUpSummary.relevantArchitect
        : undefined;

    await updateRunSummary(
      run.id,
      buildRunSummaryPayload({
        debateOutcome: debateExitOutcome,
        turnCount: state.turnCount,
        hasTruncatedCriticalTurn: state.hasTruncatedCriticalTurn || undefined,
        postApproveTruncation: state.postApproveTruncation || undefined,
        postApproveContinuationFailed:
          state.postApproveContinuationFailed || undefined,
        correctionLoopDetected: state.correctionLoopDetected || undefined,
        openReviewIssueCount: buildIssueSnapshot(state.reviewIssues).totalOpen || undefined,
        debateDurationMs,
        artifactDurationMs: null,
        userWaitMs: null,
        totalDurationMs: debateDurationMs,
        artifactsPending: true,
        peakPromptTokens: usageTotals.peakPromptTokens ?? null,
        ...opsFollowUpFieldsFromCheckpoint(opsFollowUpSummary.last),
        opsFollowUpArchitectCheckpoint: architectCheckpoint,
      }),
    );

    await updateArtifactStatus(run.id, "pending");
    artifactPhaseStarted = true;

    notify({ type: "artifacts_start" });
    return { runId: run.id, usageAccumulator, debateExitOutcome };
  } catch (error) {
    if (isSimulationBudgetExceeded(error)) {
      console.warn("Simulation budget exceeded", {
        runId: run.id,
        estimatedCostUsd: error.estimatedCostUsd,
        maxCostUsd: error.maxCostUsd,
      });
    }

    await setRunUsageTotals(run.id, usageAccumulator.getTotals());
    await reconcileRunFailure(run.id, {
      debateComplete,
      artifactPhaseStarted,
    });
    throw error;
  }
}

type LoopStepResult =
  | { action: "continue" }
  | { action: "break"; outcome: DebateExitOutcome };

async function runDebateLoop(
  state: DebateState,
  ctx: TurnContext,
): Promise<DebateExitOutcome> {
  const maxTurns = getMaxSimulationTurns(ctx.templateId);

  while (state.turnCount < maxTurns) {
    assertNotAborted(ctx.abortSignal);

    const participationStep = applyParticipationDirective(state, ctx, maxTurns);
    if (participationStep.action === "break") {
      return participationStep.outcome;
    }

    const directive = await runDebateTurn(state, ctx);
    const turnStep = applyTurnDirectiveBreakOrReroute(
      directive,
      state,
      ctx,
      maxTurns,
    );
    if (turnStep === "rerouted") {
      continue;
    }
    if (turnStep.action === "break") {
      return turnStep.outcome;
    }

    if (applySpecialRouting(state, ctx) === "rerouted") {
      continue;
    }

    if (applyProgressFollowUps(state, ctx, directive) === "rerouted") {
      continue;
    }

    const progressionStep = applyLinearProgressionOrCap(state, ctx, maxTurns);
    if (progressionStep.action === "break") {
      return progressionStep.outcome;
    }
  }

  console.warn("Simulation reached maxTurns", { runId: ctx.runId, maxTurns });
  return "cap_reached";
}

function applyParticipationDirective(
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
): LoopStepResult {
  const participationDirective = ensureRoleParticipationBeforeClose(
    state,
    ctx,
    maxTurns,
  );
  if (!participationDirective) {
    return { action: "continue" };
  }
  if (participationDirective.kind === "break") {
    return { action: "break", outcome: participationDirective.outcome };
  }

  if (participationDirective.kind === "reroute") {
    state.nextRole = participationDirective.targetRole;
    return { action: "continue" };
  }

  return { action: "continue" };
}

function applyTurnDirectiveBreakOrReroute(
  directive: TurnDirective,
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
): LoopStepResult | "rerouted" {
  if (directive.kind === "break") {
    if (state.turnCount >= maxTurns) {
      console.warn("Simulation reached maxTurns", { runId: ctx.runId, maxTurns });
    }
    return { action: "break", outcome: directive.outcome };
  }

  if (directive.kind !== "reroute") {
    return { action: "continue" };
  }

  state.nextRole = directive.targetRole;
  if (!state.isGateReroute) {
    state.returnToReviewer = true;
  }
  state.isGateReroute = false;
  return "rerouted";
}

function applySpecialRouting(
  state: DebateState,
  ctx: TurnContext,
): "continue" | "rerouted" {
  if (shouldTriggerArchitectRevision(state, ctx)) {
    state.isArchitectRevision = true;
    state.nextRole = "architect";
    state.returnToReviewer = true;
    state.roleCorrectionCounts = incrementRoleCorrectionCount(
      state.roleCorrectionCounts,
      "architect",
    );
    return "rerouted";
  }

  if (!shouldTriggerSoftwareEarlyReview(state, ctx)) {
    return "continue";
  }

  state.nextRole = "reviewer";
  state.hasHadEarlyReview = true;
  return "rerouted";
}

function applyProgressFollowUps(
  state: DebateState,
  ctx: TurnContext,
  directive: TurnDirective,
): "continue" | "rerouted" {
  if (directive.kind !== "progress") {
    return "continue";
  }

  const evaluation = recordOpsFollowUpCheckpoint(state, ctx);
  const checkpoint = state.opsFollowUpCheckpoint;

  if (evaluation?.shouldTrigger) {
    console.info("OPS FOLLOW-UP CHECKPOINT triggered", {
      runId: ctx.runId,
      templateId: ctx.templateId,
      turnCount: state.turnCount,
      lastRejectTarget: state.lastRejectTarget,
      unresolvedDevOpsIssueCount: evaluation.unresolvedDevOpsIssueCount,
      blockers: evaluation.blockers,
      lastCorrectionRole: checkpoint?.opsFollowUpLastCorrectionRole,
    });
    scheduleOpsFollowUpTurn(state, ctx, evaluation);
    return "rerouted";
  }

  if (checkpoint?.opsFollowUpEvaluated) {
    console.info("OPS FOLLOW-UP CHECKPOINT skipped", {
      runId: ctx.runId,
      templateId: ctx.templateId,
      turnCount: state.turnCount,
      skipReason: checkpoint.opsFollowUpSkipReason,
      unresolvedDevOpsIssueCount: checkpoint.opsFollowUpUnresolvedDevopsIssueCount,
      lastCorrectionRole: checkpoint.opsFollowUpLastCorrectionRole,
      eligible: checkpoint.opsFollowUpEligible,
    });
  }

  const devopsInvite = maybeScheduleDevOpsInvite(state, ctx);
  if (!devopsInvite) {
    return "continue";
  }

  state.nextRole = devopsInvite;
  return "rerouted";
}

function applyLinearProgressionOrCap(
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
): LoopStepResult {
  if (applyLinearProgression(state)) {
    return { action: "continue" };
  }

  const silentRole = selectSilentRoleNearCap({
    transcript: state.transcript,
    turnCount: state.turnCount,
    maxTurns,
    preferDevOps: true,
  });
  if (silentRole && state.turnCount < maxTurns) {
    console.info("ROLE PARTICIPATION: scheduling silent role before cap", {
      runId: ctx.runId,
      silentRole,
      turnCount: state.turnCount,
      maxTurns,
    });
    state.nextRole = silentRole;
    return { action: "continue" };
  }

  const openIssueCount = buildIssueSnapshot(state.reviewIssues).totalOpen;
  if (
    shouldPreferNearCapApprove({
      transcript: state.transcript,
      turnCount: state.turnCount,
      maxTurns,
      openIssueCount,
      unresolvedOpsIssueCount: getUnresolvedDevOpsIssues(state.reviewIssues).length,
    })
  ) {
    console.info("NEAR-CAP APPROVE: closing with approve instead of cap_reached", {
      runId: ctx.runId,
      turnCount: state.turnCount,
      maxTurns,
      openIssueCount,
    });
    return { action: "break", outcome: "approved" };
  }

  return { action: "break", outcome: "cap_reached" };
}

function ensureRoleParticipationBeforeClose(
  state: DebateState,
  ctx: TurnContext,
  maxTurns: number,
): TurnDirective | null {
  if (state.turnCount < maxTurns - 1) {
    return null;
  }

  const silentRole = selectSilentRoleNearCap({
    transcript: state.transcript,
    turnCount: state.turnCount,
    maxTurns,
    preferDevOps: true,
  });

  if (!silentRole) {
    return null;
  }

  if (state.nextRole === silentRole) {
    return null;
  }

  console.info("ROLE PARTICIPATION: near-cap invite for silent role", {
    runId: ctx.runId,
    silentRole,
    turnCount: state.turnCount,
    maxTurns,
  });

  return { kind: "reroute", targetRole: silentRole };
}

function maybeScheduleDevOpsInvite(
  state: DebateState,
  ctx: TurnContext,
): SimulationAgentRole | null {
  if (ctx.templateId === "physical") {
    return null;
  }

  const openOpsIssues = buildIssueSnapshot(state.reviewIssues).totalOpen > 0;
  const frontendSpoke = state.transcript.some((entry) => entry.role === "frontend");

  if (
    !shouldInviteDevOps({
      transcript: state.transcript,
      hasUnresolvedOpsIssues: openOpsIssues,
      frontendHasSpoken: frontendSpoke,
    })
  ) {
    return null;
  }

  // Only interrupt when the linear pipeline would otherwise skip past devops.
  if (state.nextRole === "reviewer" || state.returnToReviewer) {
    console.info("ROLE PARTICIPATION: inviting silent DevOps", {
      runId: ctx.runId,
      turnCount: state.turnCount,
      openOpsIssues,
    });
    return "devops";
  }

  return null;
}

function shouldTriggerArchitectRevision(
  state: DebateState,
  ctx: TurnContext,
): boolean {
  if (state.nextRole !== "devops") {
    return false;
  }
  if (state.isArchitectRevision) {
    return false;
  }
  if (!canCorrectRole(state.roleCorrectionCounts, "architect")) {
    return false;
  }

  const maxTurns = getMaxSimulationTurns(ctx.templateId);
  if (!canScheduleArchitectRevision(state.turnCount, maxTurns)) {
    console.info("Skipping architect revision — insufficient turn budget remaining", {
      runId: ctx.runId,
      turnCount: state.turnCount,
      maxTurns,
    });
    return false;
  }

  const architectEntry = state.transcript.find((entry) => entry.role === "architect");
  if (!architectEntry) {
    return false;
  }

  const architect = getTeamMember(ctx.roster, "architect");
  const critics: SimulationAgentRole[] = ["backend", "frontend", "devops"];
  const criticism = detectPeerCriticism(
    state.transcript,
    architect.name,
    critics,
  );

  return criticism.criticized;
}

function shouldTriggerSoftwareEarlyReview(
  state: DebateState,
  ctx: TurnContext,
): boolean {
  const shouldTrigger = shouldTriggerSoftwareEarlyReviewGate(state, ctx.templateId);
  if (!shouldTrigger) {
    return false;
  }

  console.info("SOFTWARE EARLY REVIEW CHECKPOINT triggered", {
    runId: ctx.runId,
    templateId: ctx.templateId,
    turnCount: state.turnCount,
    pipelineProgress: state.transcript.map((e) => e.role),
  });

  return true;
}

function applyLinearProgression(state: DebateState): boolean {
  if (state.returnToReviewer) {
    state.nextRole = "reviewer";
    state.returnToReviewer = false;
    return true;
  }

  state.roleIndex += 1;
  if (state.roleIndex >= SIMULATION_AGENT_ORDER.length) {
    return false;
  }
  state.nextRole = SIMULATION_AGENT_ORDER[state.roleIndex];
  return true;
}

function enrichDebateContext(
  role: SimulationAgentRole,
  state: DebateState,
  ctx: TurnContext,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
): void {
  if (role === "reviewer") {
    const agentNames = SIMULATION_AGENT_ORDER.map(
      (r) => getTeamMember(ctx.roster, r).name,
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

type ExecutedTurn =
  | { kind: "break"; outcome: DebateExitOutcome; }
  | { kind: "text"; fullText: string; wasTruncated: boolean; };

async function runDebateTurn(
  state: DebateState,
  ctx: TurnContext,
): Promise<TurnDirective> {
  const role = state.nextRole;

  await touchRunActivity(ctx.runId);

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
        NEAR_CAP_APPROVE_REMAINING_TURNS,
    },
  );

  enrichDebateContext(role, state, ctx, debateContext);

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

  const contentToPersist = normalizeTurnContent(role, fullText);

  const gateDirective = await handleArchitectQualityGate(
    role,
    contentToPersist,
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
  markDevOpsIssuesIfNeeded(state, role);

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

  const failedCorrectionDirective = resolveFailedCorrectionDirective(
    state,
    ctx,
    role,
    debateContext,
    correctionValidation,
  );
  if (failedCorrectionDirective) {
    return failedCorrectionDirective;
  }

  return resolveReviewerOutcome(role, fullText, state, ctx);
}

function markDevOpsIssuesIfNeeded(
  state: DebateState,
  role: SimulationAgentRole,
): void {
  if (!state.focusedOpsFollowUp || role !== "devops") {
    return;
  }

  markDevOpsOperationalIssuesAttempted(state.reviewIssues, state.turnCount);
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

function resolveFailedCorrectionDirective(
  state: DebateState,
  ctx: TurnContext,
  role: SimulationAgentRole,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
  correctionValidation: CorrectionValidationResult | null,
): TurnDirective | null {
  if (!debateContext.correction || !correctionValidation || correctionValidation.isValid) {
    return null;
  }

  console.warn(
    `CORRECTION LOOP FAILURE: Blocking re-review for failed ${role} correction`,
    {
      runId: ctx.runId,
      role,
      failureReason: correctionValidation.failureReason,
    },
  );

  if (hasExceededReviewerRejectionCap(state.reviewerRejectionCount)) {
    return { kind: "break", outcome: "cap_reached" };
  }

  state.reviewerRejectionCount += 1;
  if (state.lastRejectTarget) {
    state.roleCorrectionCounts = incrementRoleCorrectionCount(
      state.roleCorrectionCounts,
      state.lastRejectTarget,
    );
  }

  return { kind: "reroute", targetRole: state.lastRejectTarget ?? role };
}

async function executeDebateTurn(
  role: SimulationAgentRole,
  name: string,
  title: string,
  debateContext: ReturnType<typeof resolveDebateTurnContext>,
  transcript: TranscriptEntry[],
  ctx: TurnContext,
  options?: { disableTools?: boolean; },
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

function normalizeTurnContent(
  role: SimulationAgentRole,
  fullText: string,
): string {
  return role === "reviewer"
    ? stripReviewerDecisionTag(normalizeAgentPersistedText(role, fullText))
    : normalizeAgentPersistedText(role, fullText);
}

async function handleArchitectQualityGate(
  role: SimulationAgentRole,
  contentToPersist: string,
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

  state.isGateReroute = true;

  if (!canCorrectRole(state.roleCorrectionCounts, "architect")) {
    console.warn("Architect correction cap reached, closing debate", {
      runId: ctx.runId,
    });
    return { kind: "break", outcome: "cap_reached" };
  }

  state.roleCorrectionCounts = incrementRoleCorrectionCount(
    state.roleCorrectionCounts,
    "architect",
  );

  return { kind: "reroute", targetRole: "architect" };
}

const CRITICAL_ROLES: Set<SimulationAgentRole> = new Set([
  "architect",
  "backend",
  "frontend",
  "reviewer",
]);

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

  // Recompute from latest critical turns — earlier truncation can recover.
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

function buildNotifyHandler(
  send: (event: SimulationStreamEvent) => void,
  runId: string,
): (event: SimulationStreamEvent) => void {
  return (event: SimulationStreamEvent) => {
    try {
      send(event);
    } catch (error) {
      console.warn("Simulation stream: failed to notify client", {
        eventType: event.type,
        runId,
        error,
      });
    }
  };
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
