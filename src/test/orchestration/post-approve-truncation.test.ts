import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createSimulationRoster } from "@/ai/agents/roster";
import { maybeScheduleTruncationRecovery } from "@/ai/orchestration/resolve-reviewer-outcome";
import type {
  DebateState,
  TurnContext,
} from "@/ai/orchestration/run-simulation-types";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { TranscriptEntry } from "@/ai/context/transcript";

function buildState(
  transcript: TranscriptEntry[],
  overrides: Partial<DebateState> = {},
): DebateState {
  return {
    turnCount: 10,
    roleIndex: 0,
    returnToReviewer: false,
    nextRole: "reviewer",
    lastRejectFeedback: null,
    lastRejectTarget: null,
    reviewerRejectionCount: 0,
    roleCorrectionCounts: {},
    transcript,
    isArchitectRevision: false,
    hasTruncatedCriticalTurn: false,
    postApproveTruncation: false,
    postApproveContinuationFailed: false,
    truncationRecoveryAttemptedRoles: [],
    reviewIssues: [],
    isGateReroute: false,
    hasHadEarlyReview: true,
    hasHadOpsFollowUpForCurrentReject: false,
    focusedOpsFollowUp: null,
    opsFollowUpCheckpoint: null,
    opsFollowUpCheckpoints: [],
    consecutiveUnproductiveCycles: 0,
    correctionLoopDetected: false,
    ...overrides,
  };
}

function buildCtx(): TurnContext {
  const roster = createSimulationRoster("software");
  return {
    runId: "run_trunc",
    productIdea: "Food delivery marketplace",
    roster,
    templateId: "software",
    usageAccumulator: new RunUsageAccumulator(),
    notify: () => {},
  };
}

describe("post-approve truncation recovery", () => {
  it("schedules one recovery pass for a truncated critical role", () => {
    const state = buildState([
      {
        role: "architect",
        agentName: "Skyler",
        content: "## Decisions\n\nIncomplete",
        isTruncated: true,
      },
      {
        role: "reviewer",
        agentName: "Marcus",
        content: "Looks good.\n\n[APPROVE]",
      },
    ]);
    const directive = maybeScheduleTruncationRecovery(state, buildCtx());

    assert.equal(directive?.kind, "reroute");
    if (directive?.kind === "reroute") {
      assert.equal(directive.targetRole, "architect");
    }
    assert.deepEqual(state.truncationRecoveryAttemptedRoles, ["architect"]);
  });

  it("sets postApproveContinuationFailed when recovery already attempted", () => {
    const state = buildState(
      [
        {
          role: "architect",
          agentName: "Skyler",
          content: "## Decisions\n\nStill incomplete",
          isTruncated: true,
        },
        {
          role: "reviewer",
          agentName: "Marcus",
          content: "Approve again.\n\n[APPROVE]",
        },
      ],
      { truncationRecoveryAttemptedRoles: ["architect"] },
    );

    const directive = maybeScheduleTruncationRecovery(state, buildCtx());
    assert.equal(directive, null);
    assert.equal(state.postApproveTruncation, true);
    assert.equal(state.postApproveContinuationFailed, true);
  });

  it("clears truncation flags when the latest critical turn is complete", () => {
    const state = buildState(
      [
        {
          role: "architect",
          agentName: "Skyler",
          content: "## Decisions & Risks\n\nComplete plan ends here.",
          isTruncated: false,
        },
        {
          role: "reviewer",
          agentName: "Marcus",
          content: "Ship it.\n\n[APPROVE]",
        },
      ],
      {
        truncationRecoveryAttemptedRoles: ["architect"],
        postApproveTruncation: true,
      },
    );

    const directive = maybeScheduleTruncationRecovery(state, buildCtx());
    assert.equal(directive, null);
    assert.equal(state.postApproveTruncation, false);
    assert.equal(state.postApproveContinuationFailed, false);
  });
});
