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
  MAX_SIMULATION_TURNS,
  parseReviewerDecision,
  resolveUnknownReviewerDecision,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import {
  createReviewIssues,
  markIssuesAttempted,
  markIssuesFailedValidation,
  markIssuesAddressed,
  buildIssueSnapshot,
  type ReviewIssue,
} from "@/ai/orchestration/review-issue-tracker";
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
      reviewIssues: [],
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

    const debateExitOutcome = await runDebateLoop(state, ctx);

    assertNotAborted(abortSignal);

    debateComplete = true;

    await updateRunSummary(
      run.id,
      buildRunSummaryPayload({
        debateOutcome: debateExitOutcome,
        turnCount: state.turnCount,
        hasTruncatedCriticalTurn: state.hasTruncatedCriticalTurn || undefined,
        openReviewIssueCount: buildIssueSnapshot(state.reviewIssues).totalOpen || undefined,
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

async function runDebateLoop(
  state: DebateState,
  ctx: TurnContext,
): Promise<DebateExitOutcome> {
  while (state.turnCount < MAX_SIMULATION_TURNS) {
    assertNotAborted(ctx.abortSignal);

    const directive = await runDebateTurn(state, ctx);

    if (directive.kind === "break") {
      if (state.turnCount >= MAX_SIMULATION_TURNS) {
        console.warn("Simulation reached MAX_SIMULATION_TURNS", { runId: ctx.runId });
      }
      return directive.outcome;
    }

    if (directive.kind === "reroute") {
      state.nextRole = directive.targetRole;
      state.returnToReviewer = true;
      continue;
    }

    if (shouldTriggerArchitectRevision(state, ctx)) {
      state.isArchitectRevision = true;
      state.nextRole = "architect";
      state.returnToReviewer = true;
      state.roleCorrectionCounts = incrementRoleCorrectionCount(
        state.roleCorrectionCounts,
        "architect",
      );
      continue;
    }

    if (!applyLinearProgression(state)) {
      return "cap_reached";
    }
  }

  console.warn("Simulation reached MAX_SIMULATION_TURNS", { runId: ctx.runId });
  return "cap_reached";
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
  if (!canScheduleArchitectRevision(state.turnCount)) {
    console.info("Skipping architect revision — insufficient turn budget remaining", {
      runId: ctx.runId,
      turnCount: state.turnCount,
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

  const gateDirective = await handleArchitectQualityGate(role, contentToPersist, ctx, state);
  if (gateDirective) {
    return gateDirective;
  }

  // CORRECTION LOOP FAILURE GUARD — validate correction turns before persisting
  const isCorrectionTurn = debateContext.correction != null;
  let correctionValidation: CorrectionValidationResult | null = null;

  if (isCorrectionTurn) {
    const targetRole = debateContext.correction!.targetRole;

    // STRUCTURED RESOLUTION TRACKING — mark issues as attempted when
    // the agent produces a correction turn for the rejected role.
    markIssuesAttempted(state.reviewIssues, targetRole, state.turnCount);

    const previousEntry = findLastTranscriptEntry(state.transcript, targetRole);
    const feedback = state.lastRejectFeedback ?? "";

    if (previousEntry) {
      correctionValidation = validateCorrectionTurn(
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

        // STRUCTURED RESOLUTION TRACKING — mark as failed
        markIssuesFailedValidation(state.reviewIssues, targetRole);
      }
    }
  }

  await persistTurn(
    role,
    contentToPersist,
    member.name,
    ctx,
    state,
    turnResult.wasTruncated,
    correctionValidation,
  );

  if (state.isArchitectRevision) {
    state.isArchitectRevision = false;
  }

  // If the correction turn failed validation, skip normal re-review routing
  // and force a synthetic re-reject to consume budget without proceeding
  if (isCorrectionTurn && correctionValidation && !correctionValidation.isValid) {
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

  return resolveReviewerOutcome(role, fullText, state, ctx);
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
  if (role !== "reviewer" || parseReviewerDecision(fullText, ctx.roster).decision !== "unknown") {
    return fullText;
  }

  const recoveredTag = await recoverReviewerDecisionTag(fullText, {
    usageAccumulator: ctx.usageAccumulator,
    abortSignal: ctx.abortSignal,
  });

  if (recoveredTag) {
    fullText = `${fullText.trimEnd()}\n\n${recoveredTag}`;
  }

  assertSimulationWithinBudget(ctx.usageAccumulator);
  return fullText;
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

  state.lastRejectFeedback = rejectPersisted;
  state.lastRejectTarget = "architect";

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

// TRUNCATION HANDLING FAILURE GUARD — persists the turn with optional
// truncation and correction-failure flags carried through to downstream consumers.
//
// CRITICAL_ROLES are roles whose output is essential for a build-ready run.
// If any of these roles produces a truncated turn, the run is downgraded.
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
  // TRUNCATION APPROVAL GUARD — track truncated critical turns
  if (wasTruncated && CRITICAL_ROLES.has(role)) {
    state.hasTruncatedCriticalTurn = true;
    console.warn(
      `TRUNCATION APPROVAL GUARD: critical role ${role} turn was truncated — run will be downgraded`,
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

function resolveReviewerOutcome(
  role: SimulationAgentRole,
  fullText: string,
  state: DebateState,
  ctx: TurnContext,
): TurnDirective {
  if (role !== "reviewer") {
    return { kind: "progress" };
  }

  const parsed = parseReviewerDecision(fullText, ctx.roster);

  if (parsed.decision === "approve") {
    state.lastRejectFeedback = null;
    state.lastRejectTarget = null;

    // TRUNCATION APPROVAL GUARD — reviewer issues [APPROVE] but
    // one or more critical-role turns were truncated. The run is
    // downgraded to degraded_truncated so artifacts/export reflect
    // the incomplete state.
    if (state.hasTruncatedCriticalTurn) {
      console.warn(
        "TRUNCATION APPROVAL GUARD: reviewer approved but critical turns were truncated — downgrading to degraded_truncated",
        { runId: ctx.runId, turnCount: state.turnCount },
      );
      markIssuesAddressed(state.reviewIssues);
      return { kind: "break", outcome: "degraded_truncated" };
    }

    // STRUCTURED RESOLUTION TRACKING — mark all issues as addressed
    markIssuesAddressed(state.reviewIssues);
    return { kind: "break", outcome: "approved" };
  }

  if (parsed.decision === "reject" && parsed.rejectRole) {
    // STRUCTURED RESOLUTION TRACKING — create/update issues from rejection
    const newIssues = createReviewIssues(
      state.reviewIssues,
      parsed.rejectRole,
      parsed.displayText,
      state.reviewerRejectionCount,
      state.turnCount,
    );
    state.reviewIssues.push(...newIssues);

    if (hasExceededReviewerRejectionCap(state.reviewerRejectionCount)) {
      console.warn("Reviewer rejection cap reached, closing debate", {
        runId: ctx.runId,
        reviewerRejectionCount: state.reviewerRejectionCount,
        maxReviewerRejectionCycles: 4,
        perRoleCorrections: { ...state.roleCorrectionCounts },
        openIssues: buildIssueSnapshot(state.reviewIssues).totalOpen,
      });
      return { kind: "break", outcome: "cap_reached" };
    }

    if (!canCorrectRole(state.roleCorrectionCounts, parsed.rejectRole)) {
      console.warn("Per-role correction cap reached, closing debate", {
        runId: ctx.runId,
        rejectRole: parsed.rejectRole,
        maxPerRole: 2,
        currentCount: state.roleCorrectionCounts[parsed.rejectRole] ?? 0,
        openIssues: buildIssueSnapshot(state.reviewIssues).totalOpen,
      });
      return { kind: "break", outcome: "cap_reached" };
    }

    state.reviewerRejectionCount += 1;
    state.roleCorrectionCounts = incrementRoleCorrectionCount(
      state.roleCorrectionCounts,
      parsed.rejectRole,
    );
    state.lastRejectFeedback = parsed.displayText.trim() || null;
    state.lastRejectTarget = parsed.rejectRole;
    return { kind: "reroute", targetRole: parsed.rejectRole };
  }

  console.warn("Invalid reviewer decision, routing correction");

  const fallback = resolveUnknownReviewerDecision();
  const fallbackRole = fallback.rejectRole ?? "pm";

  if (state.turnCount < MAX_SIMULATION_TURNS) {
    if (!canCorrectRole(state.roleCorrectionCounts, fallbackRole)) {
      return { kind: "break", outcome: "unknown_reject_fallback" };
    }

    state.roleCorrectionCounts = incrementRoleCorrectionCount(
      state.roleCorrectionCounts,
      fallbackRole,
    );
    state.lastRejectFeedback = parsed.displayText.trim() || null;
    state.lastRejectTarget = fallbackRole;
    return { kind: "reroute", targetRole: fallbackRole };
  }

  return { kind: "break", outcome: "unknown_reject_fallback" };
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
