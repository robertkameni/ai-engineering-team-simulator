import { SIMULATION_AGENT_ORDER } from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import { classifyProjectTeamTemplate } from "@/ai/orchestration/classify-project";
import { buildIssueSnapshot } from "@/ai/orchestration/review-issue-tracker";
import {
  isSimulationBudgetExceeded,
  assertSimulationWithinBudget,
} from "@/ai/orchestration/simulation-budget";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { buildRunSummaryPayload } from "@/lib/db/run-summary";
import { buildDebateFinalizationTelemetry } from "@/lib/db/debate-finalization-telemetry";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  createRun,
  setRunUsageTotals,
  touchRunActivity,
  updateRunSummary,
} from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { selectOpsFollowUpSummary } from "@/ai/orchestration/ops-follow-up-checkpoint";
import { assertNotAborted } from "./simulation-abort";
import { opsFollowUpFieldsFromCheckpoint } from "@/lib/db/ops-follow-up-summary";
import type {
  DebateState,
  RunSimulationOptions,
  RunSimulationResult,
} from "./run-simulation-types";
import type { TurnContext } from "./run-simulation-types";
import { runDebateLoop } from "./run-debate-loop";

export { isSimulationAborted } from "./simulation-abort";
export type { RunSimulationOptions, RunSimulationResult } from "./run-simulation-types";

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
      phase: "initial_delivery",
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
      reviewIssueBaseline: null,
      isGateReroute: false,
      hasHadEarlyReview: false,
      hasHadOpsFollowUpForCurrentReject: false,
      focusedOpsFollowUp: null,
      opsFollowUpCheckpoint: null,
      opsFollowUpCheckpoints: [],
      consecutiveUnproductiveCycles: 0,
      correctionLoopDetected: false,
      reviewerProposal: null,
      finalizationProposal: null,
      outputDiagnostics: null,
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
        finalization: buildDebateFinalizationTelemetry({
          reason: state.finalizationProposal?.reason,
          rejectCount: state.reviewerRejectionCount,
          correctionsByRole: state.roleCorrectionCounts,
          acceptedCriticalRisks:
            state.finalizationProposal?.acceptedCriticalRisks ?? [],
          outputDiagnostics: state.outputDiagnostics,
        }),
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
