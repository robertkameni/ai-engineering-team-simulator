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
  MAX_SIMULATION_TURNS,
  parseReviewerDecision,
  resolveUnknownReviewerDecision,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
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
      JSON.stringify({ debateOutcome: debateExitOutcome, turnCount: state.turnCount }),
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

    if (shouldTriggerArchitectRevision(state)) {
      state.isArchitectRevision = true;
      state.nextRole = "architect";
      state.returnToReviewer = true;
      continue;
    }

    if (!applyLinearProgression(state)) {
      return "cap_reached";
    }
  }

  console.warn("Simulation reached MAX_SIMULATION_TURNS", { runId: ctx.runId });
  return "cap_reached";
}

function shouldTriggerArchitectRevision(_state: DebateState): boolean {
  return false;
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

  await persistTurn(role, contentToPersist, member.name, ctx, state);

  if (state.isArchitectRevision) {
    state.isArchitectRevision = false;
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
): Promise<
  | { kind: "break"; outcome: DebateExitOutcome; }
  | { kind: "text"; fullText: string; }
> {
  try {
    const fullText = await streamAgentTurn({
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
    return { kind: "text", fullText };
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
    return { kind: "text", fullText: AGENT_TURN_FALLBACK };
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

async function persistTurn(
  role: SimulationAgentRole,
  contentToPersist: string,
  agentName: string,
  ctx: TurnContext,
  state: DebateState,
): Promise<void> {
  state.transcript.push({ role, agentName, content: contentToPersist });

  await appendMessage(
    ctx.runId,
    role,
    contentToPersist,
    state.transcript.length - 1,
    agentName,
  );

  state.turnCount += 1;
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
    return { kind: "break", outcome: "approved" };
  }

  if (parsed.decision === "reject" && parsed.rejectRole) {
    if (hasExceededReviewerRejectionCap(state.reviewerRejectionCount)) {
      console.warn("Reviewer rejection cap reached, closing debate", {
        runId: ctx.runId,
        reviewerRejectionCount: state.reviewerRejectionCount,
      });
      return { kind: "break", outcome: "cap_reached" };
    }

    if (!canCorrectRole(state.roleCorrectionCounts, parsed.rejectRole)) {
      console.warn("Per-role correction cap reached, closing debate", {
        runId: ctx.runId,
        rejectRole: parsed.rejectRole,
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
