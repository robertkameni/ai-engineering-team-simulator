import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideDebateConvergence } from "@/ai/orchestration/debate-convergence-controller";
import type { DebateState } from "@/ai/orchestration/run-simulation-types";
import type { TranscriptEntry } from "@/ai/context/transcript";

function fullSoftwareTranscript(
  architectOverrides: Partial<TranscriptEntry> = {},
): TranscriptEntry[] {
  return [
    { role: "pm", agentName: "P", content: "Scope for v1." },
    {
      role: "architect",
      agentName: "A",
      content: "## Summary\n\nDesign mid-",
      isTruncated: true,
      ...architectOverrides,
    },
    { role: "backend", agentName: "B", content: "API plan complete." },
    { role: "frontend", agentName: "F", content: "UI plan complete." },
    { role: "devops", agentName: "D", content: "Ops plan complete." },
    { role: "reviewer", agentName: "R", content: "Ship it.\n\n[APPROVE]" },
  ];
}

function buildApprovedState(
  overrides: Partial<DebateState> = {},
): DebateState {
  return {
    phase: "final_review",
    turnCount: 8,
    roleIndex: 0,
    returnToReviewer: false,
    nextRole: "reviewer",
    lastRejectFeedback: null,
    lastRejectTarget: null,
    reviewerRejectionCount: 1,
    roleCorrectionCounts: {},
    transcript: fullSoftwareTranscript(),
    isArchitectRevision: false,
    hasTruncatedCriticalTurn: true,
    postApproveTruncation: false,
    truncationRetried: false,
    postApproveContinuationFailed: false,
    truncationRecoveryAttemptedRoles: [],
    reviewIssues: [],
    reviewIssueBaseline: null,
    isGateReroute: false,
    hasHadEarlyReview: true,
    hasHadOpsFollowUpForCurrentReject: false,
    focusedOpsFollowUp: null,
    opsFollowUpCheckpoint: null,
    opsFollowUpCheckpoints: [],
    consecutiveUnproductiveCycles: 0,
    correctionLoopDetected: false,
    reviewerProposal: {
      decision: "approve",
      feedbackText: "ok",
      source: "reviewer",
      issuedOnTurn: 8,
    },
    finalizationProposal: null,
    outputDiagnostics: null,
    ...overrides,
  };
}

describe("pre-approval truncation recovery (P2)", () => {
  it("retries a truncated critical role before finalizing approval", () => {
    const state = buildApprovedState();
    const directive = decideDebateConvergence(state, { templateId: "software" });

    assert.equal(directive.kind, "schedule_turn");
    if (directive.kind === "schedule_turn") {
      assert.equal(directive.role, "architect");
    }
    assert.equal(state.postApproveTruncation, false);
    assert.deepEqual(state.truncationRecoveryAttemptedRoles, ["architect"]);
  });

  it("targets the truncated critical role specifically", () => {
    const state = buildApprovedState({
      transcript: [
        { role: "pm", agentName: "P", content: "Scope" },
        { role: "architect", agentName: "A", content: "Complete architecture." },
        {
          role: "backend",
          agentName: "B",
          content: "## Decisions\n\nCut mid-",
          isTruncated: true,
        },
        { role: "frontend", agentName: "F", content: "UI" },
        { role: "devops", agentName: "D", content: "Ops" },
        { role: "reviewer", agentName: "R", content: "[APPROVE]" },
      ],
    });

    const directive = decideDebateConvergence(state, { templateId: "software" });
    assert.equal(directive.kind, "schedule_turn");
    if (directive.kind === "schedule_turn") {
      assert.equal(directive.role, "backend");
    }
  });

  it("marks truncationRetried when recovery already failed", () => {
    const state = buildApprovedState({
      truncationRecoveryAttemptedRoles: ["architect"],
    });

    const directive = decideDebateConvergence(state, { templateId: "software" });
    assert.equal(directive.kind, "finalize");
    assert.equal(state.postApproveTruncation, true);
    assert.equal(state.truncationRetried, true);
  });
});
