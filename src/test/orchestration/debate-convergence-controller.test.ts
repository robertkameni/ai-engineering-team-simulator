import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SimulationAgentRole } from "@/ai/agents/config";
import {
  decideDebateConvergence,
  type DebateConvergenceDirective,
  type DebatePhase,
  type ReviewerTurnProposal,
} from "@/ai/orchestration/debate-convergence-controller";
import type { DebateState } from "@/ai/orchestration/run-simulation-types";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";

function buildIssue(
  id: string,
  excerpt: string,
  targetRole: SimulationAgentRole,
): ReviewIssue {
  return {
    id,
    targetRole,
    keywords: excerpt.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 4),
    excerpt,
    status: "open",
    severity: "blocker",
    createdOnCycle: 0,
    lastAttemptedOnTurn: null,
    lastConfirmedOnTurn: 6,
    acceptedRisk: null,
  };
}

function buildTranscript(roles: readonly SimulationAgentRole[]): DebateState["transcript"] {
  return roles.map((role, index) => ({
    role,
    agentName: `${role}_${index}`,
    content: `${role} turn ${index + 1}`,
  }));
}

function buildProposal(
  decision: ReviewerTurnProposal["decision"],
  overrides: Partial<ReviewerTurnProposal> = {},
): ReviewerTurnProposal {
  return {
    decision,
    feedbackText: overrides.feedbackText ?? "Reviewer feedback",
    rejectRole: overrides.rejectRole,
    scopedRejectRole: overrides.scopedRejectRole,
    source: overrides.source ?? "reviewer",
    issuedOnTurn: overrides.issuedOnTurn ?? 6,
  };
}

function buildState(overrides: Partial<DebateState> = {}): DebateState {
  return {
    phase: "initial_delivery",
    turnCount: 0,
    roleIndex: 0,
    returnToReviewer: false,
    nextRole: "pm",
    lastRejectFeedback: null,
    lastRejectTarget: null,
    reviewerRejectionCount: 0,
    roleCorrectionCounts: {},
    transcript: [],
    isArchitectRevision: false,
    hasTruncatedCriticalTurn: false,
    postApproveTruncation: false,
    truncationRetried: false,
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
    ...overrides,
  };
}

function assertSchedule(
  directive: DebateConvergenceDirective,
  expectedPhase: DebatePhase,
  expectedRole: SimulationAgentRole,
): void {
  assert.equal(directive.kind, "schedule_turn");
  if (directive.kind !== "schedule_turn") {
    return;
  }
  assert.equal(directive.phase, expectedPhase);
  assert.equal(directive.role, expectedRole);
}

describe("decideDebateConvergence", () => {
  it("follows the deterministic software schedule through initial review", () => {
    assertSchedule(
      decideDebateConvergence(
        buildState({ turnCount: 0, transcript: [] }),
        { templateId: "software" },
      ),
      "initial_delivery",
      "pm",
    );
    assertSchedule(
      decideDebateConvergence(
        buildState({
          turnCount: 4,
          transcript: buildTranscript(["pm", "architect", "backend", "frontend"]),
        }),
        { templateId: "software" },
      ),
      "initial_delivery",
      "devops",
    );
    assertSchedule(
      decideDebateConvergence(
        buildState({
          turnCount: 5,
          transcript: buildTranscript([
            "pm",
            "architect",
            "backend",
            "frontend",
            "devops",
          ]),
        }),
        { templateId: "software" },
      ),
      "initial_review",
      "reviewer",
    );
  });

  it("uses at most two targeted software turns before final review", () => {
    const correctionDirective = decideDebateConvergence(
      buildState({
        phase: "initial_review",
        turnCount: 6,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "backend",
          scopedRejectRole: "backend",
        }),
      }),
      { templateId: "software" },
    );
    assertSchedule(correctionDirective, "correction_wave", "backend");

    const opsDirective = decideDebateConvergence(
      buildState({
        phase: "correction_wave",
        turnCount: 7,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "architect",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "architect",
          scopedRejectRole: "architect",
          issuedOnTurn: 6,
        }),
        reviewIssues: [
          buildIssue(
            "ri_ops",
            "Security alerting coverage remains unresolved for restore failures",
            "devops",
          ),
        ],
      }),
      { templateId: "software" },
    );
    assertSchedule(opsDirective, "ops_closure", "devops");

    const finalReviewDirective = decideDebateConvergence(
      buildState({
        phase: "ops_closure",
        turnCount: 8,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "architect",
          "devops",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "architect",
          scopedRejectRole: "architect",
          issuedOnTurn: 6,
        }),
        reviewIssues: [
          buildIssue("ri_minor", "Observability detail remains incomplete", "devops"),
        ],
      }),
      { templateId: "software" },
    );
    assertSchedule(finalReviewDirective, "final_review", "reviewer");
  });

  it("prioritizes finalization at turn 8 instead of another correction", () => {
    const directive = decideDebateConvergence(
      buildState({
        phase: "correction_wave",
        turnCount: 8,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "backend",
          "reviewer",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "backend",
          scopedRejectRole: "backend",
          issuedOnTurn: 8,
        }),
        roleCorrectionCounts: { backend: 1 },
      }),
      { templateId: "software" },
    );

    assert.equal(directive.kind, "finalize");
    if (directive.kind === "finalize") {
      assert.equal(directive.outcome, "approved");
    }
  });

  it("advances to final review when rejection or correction budgets are exhausted", () => {
    const rejectionBudgetDirective = decideDebateConvergence(
      buildState({
        phase: "correction_wave",
        turnCount: 7,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "backend",
        ]),
        reviewerRejectionCount: 5,
        reviewerProposal: buildProposal("reject", {
          rejectRole: "backend",
          scopedRejectRole: "backend",
        }),
      }),
      { templateId: "software" },
    );
    assertSchedule(rejectionBudgetDirective, "final_review", "reviewer");

    const correctionBudgetDirective = decideDebateConvergence(
      buildState({
        phase: "correction_wave",
        turnCount: 7,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "architect",
        ]),
        roleCorrectionCounts: { architect: 3 },
        reviewerProposal: buildProposal("reject", {
          rejectRole: "architect",
          scopedRejectRole: "architect",
        }),
      }),
      { templateId: "software" },
    );
    assertSchedule(correctionBudgetDirective, "final_review", "reviewer");
  });

  it("finalizes as approved with typed accepted critical risks", () => {
    const state = buildState({
      phase: "final_review",
      turnCount: 9,
      transcript: buildTranscript([
        "pm",
        "architect",
        "backend",
        "frontend",
        "devops",
        "reviewer",
        "backend",
        "devops",
        "reviewer",
      ]),
      reviewerProposal: buildProposal("reject", {
        rejectRole: "backend",
        scopedRejectRole: "backend",
        feedbackText:
          "Security boundary remains unresolved and backup restore data loss risk persists.",
        issuedOnTurn: 9,
      }),
      reviewIssues: [
        buildIssue(
          "ri_security",
          "Security boundary remains unresolved for privileged tooling access",
          "backend",
        ),
        buildIssue(
          "ri_noncritical",
          "Performance benchmark details are still missing",
          "backend",
        ),
      ],
    });

    const directive = decideDebateConvergence(state, { templateId: "software" });

    assert.equal(directive.kind, "finalize");
    if (directive.kind !== "finalize") {
      return;
    }
    assert.equal(directive.phase, "finalized");
    assert.equal(directive.outcome, "approved");
    assert.deepEqual(
      directive.acceptedCriticalRisks.map((risk) => risk.category),
      ["security"],
    );
    assert.equal(state.reviewIssues[0]?.status, "accepted_risk");
    assert.equal(state.reviewIssues[1]?.status, "accepted_risk");
  });

  it("never emits cap_reached when the software schedule is exhausted", () => {
    const directive = decideDebateConvergence(
      buildState({
        phase: "final_review",
        turnCount: 10,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "backend",
          "devops",
          "reviewer",
          "reviewer",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "frontend",
          scopedRejectRole: "frontend",
          issuedOnTurn: 10,
        }),
      }),
      { templateId: "software" },
    );

    assert.equal(directive.kind, "finalize");
    if (directive.kind === "finalize") {
      assert.equal(directive.outcome, "approved");
    }
  });

  it("keeps the physical path on its own control budget", () => {
    const directive = decideDebateConvergence(
      buildState({
        phase: "correction_wave",
        turnCount: 8,
        transcript: buildTranscript([
          "pm",
          "architect",
          "backend",
          "frontend",
          "devops",
          "reviewer",
          "architect",
          "reviewer",
        ]),
        reviewerProposal: buildProposal("reject", {
          rejectRole: "architect",
          scopedRejectRole: "architect",
          issuedOnTurn: 8,
        }),
      }),
      { templateId: "physical" },
    );

    assertSchedule(directive, "correction_wave", "architect");
  });
});
