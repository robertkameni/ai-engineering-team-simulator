import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  isWorthlessContinuation,
  mergeContinuationText,
  sanitizeMergedContinuation,
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import {
  maybeScheduleTruncationRecovery,
  resolveReviewerOutcome,
} from "@/ai/orchestration/resolve-reviewer-outcome";
import {
  shouldPreferNearCapApprove,
} from "@/ai/orchestration/role-participation";
import type { DebateState, TurnContext } from "@/ai/orchestration/run-simulation-types";
import { evaluateOpsFollowUpTrigger } from "@/ai/orchestration/ops-follow-up";
import { createReviewIssues } from "@/ai/orchestration/review-issue-tracker";
import { getMaxSimulationTurns } from "@/ai/orchestration/reviewer-decision";
import { canExportApprovedRun } from "@/features/artifacts/artifact-panel-phase";
import {
  computeArtifactPollIntervalMs,
  countArtifactPollIntervalsWithinMs,
  POLL_ARTIFACT_INITIAL_MS,
  POLL_ARTIFACT_MAX_INTERVAL_MS,
} from "@/features/simulation/artifact-poll-backoff";
import { SIMULATION_AWAITS_ARTIFACT_SYNTHESIS_BEFORE_DONE } from "@/lib/ai/simulation-artifact-contract";
import {
  buildRunSummaryPayload,
  computeTotalDurationMs,
  parseRunSummary,
} from "@/lib/db/run-summary";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

function fullParticipationTranscript(): TranscriptEntry[] {
  return [
    { role: "pm", agentName: "P", content: "scope" },
    { role: "architect", agentName: "A", content: "arch" },
    { role: "backend", agentName: "B", content: "api" },
    { role: "frontend", agentName: "F", content: "ui" },
    { role: "devops", agentName: "D", content: "ops" },
    { role: "reviewer", agentName: "R", content: "review\n\n[APPROVE]" },
  ];
}

function buildState(overrides: Partial<DebateState> = {}): DebateState {
  return {
    turnCount: 8,
    roleIndex: 0,
    returnToReviewer: false,
    nextRole: "reviewer",
    lastRejectFeedback: null,
    lastRejectTarget: null,
    reviewerRejectionCount: 0,
    roleCorrectionCounts: {},
    transcript: fullParticipationTranscript(),
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
    ...overrides,
  };
}

function buildCtx(templateId: "software" | "physical" = "software"): TurnContext {
  return {
    runId: "run_test",
    productIdea: "test product",
    roster: createSimulationRoster(templateId),
    templateId,
    usageAccumulator: new RunUsageAccumulator(),
    notify: () => undefined,
  };
}

describe("SIMULATION_AWAITS_ARTIFACT_SYNTHESIS_BEFORE_DONE contract", () => {
  it("is true so simulate awaits synthesis before SSE done", () => {
    assert.equal(SIMULATION_AWAITS_ARTIFACT_SYNTHESIS_BEFORE_DONE, true);
  });
});

describe("computeTotalDurationMs", () => {
  it("sums debate and artifact durations when both present", () => {
    assert.equal(
      computeTotalDurationMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 40_000,
      }),
      140_000,
    );
  });

  it("treats missing artifact phase as zero when debate is set", () => {
    assert.equal(
      computeTotalDurationMs({
        debateDurationMs: 100_000,
        artifactDurationMs: null,
      }),
      100_000,
    );
  });
});

describe("artifact poll backoff", () => {
  it("starts at the initial interval and caps at max", () => {
    assert.equal(computeArtifactPollIntervalMs(0), POLL_ARTIFACT_INITIAL_MS);
    assert.equal(computeArtifactPollIntervalMs(20), POLL_ARTIFACT_MAX_INTERVAL_MS);
  });

  it("grows exponentially between attempts", () => {
    const first = computeArtifactPollIntervalMs(0);
    const second = computeArtifactPollIntervalMs(1);
    assert.ok(second > first);
    assert.ok(second <= POLL_ARTIFACT_MAX_INTERVAL_MS);
  });

  it("keeps a 60s window well under the old 400-poll storm", () => {
    const intervalsIn60s = countArtifactPollIntervalsWithinMs(60_000);
    assert.ok(intervalsIn60s < 40);
    assert.ok(intervalsIn60s > 0);
  });
});

describe("canExportApprovedRun", () => {
  it("blocks approved runs with zero core artifacts", () => {
    assert.equal(
      canExportApprovedRun({
        debateOutcome: "approved",
        artifacts: null,
      }),
      false,
    );
  });

  it("allows approved runs with all five core artifacts", () => {
    assert.equal(
      canExportApprovedRun({
        debateOutcome: "approved",
        artifacts: {
          requirements: [{ title: "R", items: ["a"] }],
          architecture: [{ title: "A", items: ["a"] }],
          implementation: [{ title: "I", items: ["a"] }],
          blueprint: [{ title: "B", items: ["a"] }],
          review: [{ title: "V", items: ["a"] }],
        },
      }),
      true,
    );
  });

  it("allows unapproved runs even without artifacts", () => {
    assert.equal(
      canExportApprovedRun({
        debateOutcome: "cap_reached",
        artifacts: null,
      }),
      true,
    );
  });
});

describe("shouldPreferNearCapApprove", () => {
  it("approves near cap when participation is complete and issues are minor", () => {
    const maxTurns = getMaxSimulationTurns("software");
    assert.equal(
      shouldPreferNearCapApprove({
        transcript: fullParticipationTranscript(),
        turnCount: maxTurns - 1,
        maxTurns,
        openIssueCount: 1,
      }),
      true,
    );
  });

  it("does not approve near cap with many open issues", () => {
    const maxTurns = getMaxSimulationTurns("software");
    assert.equal(
      shouldPreferNearCapApprove({
        transcript: fullParticipationTranscript(),
        turnCount: maxTurns - 1,
        maxTurns,
        openIssueCount: 10,
      }),
      false,
    );
  });

  it("does not approve when a pipeline role is silent", () => {
    const maxTurns = getMaxSimulationTurns("software");
    assert.equal(
      shouldPreferNearCapApprove({
        transcript: fullParticipationTranscript().filter((e) => e.role !== "devops"),
        turnCount: maxTurns - 1,
        maxTurns,
        openIssueCount: 0,
      }),
      false,
    );
  });
});

describe("truncation recovery before finalize approve", () => {
  it("reroutes to truncated critical role instead of setting postApproveTruncation", () => {
    const state = buildState({
      transcript: [
        ...fullParticipationTranscript().filter((e) => e.role !== "architect"),
        {
          role: "architect",
          agentName: "A",
          content: "## Architecture\n\nIncomplete mid-",
          isTruncated: true,
        },
        { role: "reviewer", agentName: "R", content: "ok\n\n[APPROVE]" },
      ],
      turnCount: 8,
    });
    const ctx = buildCtx("software");

    const directive = maybeScheduleTruncationRecovery(state, ctx);

    assert.equal(directive?.kind, "reroute");
    if (directive?.kind === "reroute") {
      assert.equal(directive.targetRole, "architect");
    }
    assert.equal(state.postApproveTruncation, false);
    assert.deepEqual(state.truncationRecoveryAttemptedRoles, ["architect"]);
  });

  it("clears postApproveTruncation when approve lands with no truncation", () => {
    const state = buildState({
      postApproveTruncation: true,
      hasTruncatedCriticalTurn: true,
      truncationRecoveryAttemptedRoles: ["architect"],
      transcript: fullParticipationTranscript(),
    });
    const ctx = buildCtx("software");

    const directive = resolveReviewerOutcome(
      "reviewer",
      "All gaps closed.\n\n[APPROVE]",
      state,
      ctx,
    );

    assert.equal(directive.kind, "break");
    if (directive.kind === "break") {
      assert.equal(directive.outcome, "approved");
    }
    assert.equal(state.postApproveTruncation, false);
  });

  it("sets postApproveTruncation only after recovery was already attempted", () => {
    const state = buildState({
      truncationRecoveryAttemptedRoles: ["architect"],
      transcript: [
        {
          role: "pm",
          agentName: "P",
          content: "scope",
        },
        {
          role: "architect",
          agentName: "A",
          content: "## Architecture\n\nStill cut mid-",
          isTruncated: true,
        },
        { role: "backend", agentName: "B", content: "api" },
        { role: "frontend", agentName: "F", content: "ui" },
        { role: "devops", agentName: "D", content: "ops" },
        { role: "reviewer", agentName: "R", content: "ok\n\n[APPROVE]" },
      ],
      turnCount: 18,
    });
    const ctx = buildCtx("software");

    const directive = resolveReviewerOutcome(
      "reviewer",
      "Still approving.\n\n[APPROVE]",
      state,
      ctx,
    );

    assert.equal(directive.kind, "break");
    if (directive.kind === "break") {
      assert.equal(directive.outcome, "approved");
    }
    assert.equal(state.postApproveTruncation, true);
  });
});

describe("near-cap approve via resolveReviewerOutcome", () => {
  it("prefers approved over reject cycle when participation is complete near cap", () => {
    const maxTurns = getMaxSimulationTurns("software");
    const state = buildState({
      turnCount: maxTurns - 1,
      transcript: fullParticipationTranscript(),
      reviewIssues: [],
    });
    const ctx = buildCtx("software");

    const directive = resolveReviewerOutcome(
      "reviewer",
      "Still missing a minor nit.\n\n[REJECT: backend]",
      state,
      ctx,
    );

    assert.equal(directive.kind, "break");
    if (directive.kind === "break") {
      assert.equal(directive.outcome, "approved");
    }
  });
});

describe("ops follow-up near-cap after non-architect correction", () => {
  it("triggers DevOps invite near cap despite not_architect_correction gate", () => {
    const roster = createSimulationRoster("software");
    const maxTurns = getMaxSimulationTurns("software");
    const feedback = `
**Disagree** Ops gaps remain.

**${roster.devops.name}**: Add backup restore validation. **UNRESOLVED.**
**${roster.devops.name}**: Add dead-letter growth alert. **UNRESOLVED.**
`;
    const reviewIssues = createReviewIssues(
      [],
      "devops",
      feedback,
      0,
      maxTurns - 2,
      roster,
    );
    const state = buildState({
      turnCount: maxTurns - 2,
      returnToReviewer: true,
      lastRejectFeedback: feedback,
      lastRejectTarget: "backend",
      roleCorrectionCounts: { backend: 1 },
      transcript: [
        { role: "reviewer", agentName: roster.reviewer.name, content: "Review" },
        { role: "backend", agentName: roster.backend.name, content: "Backend fix" },
      ],
      reviewIssues,
    });
    const ctx = buildCtx("software");

    const evaluation = evaluateOpsFollowUpTrigger(state, ctx);

    assert.equal(evaluation.shouldTrigger, true);
    assert.equal(evaluation.skipReason, null);
    assert.ok(evaluation.unresolvedDevOpsIssueCount >= 1);
  });
});

describe("continuation meta-spam suppression", () => {
  it("treats no-continuation meta and duplicate tags as worthless", () => {
    assert.equal(isWorthlessContinuation("no continuation needed"), true);
    assert.equal(isWorthlessContinuation("[APPROVE]"), true);
    assert.equal(
      isWorthlessContinuation("NO_CONTINUATION_NEEDED\n\n[APPROVE]"),
      true,
    );
    assert.equal(
      isWorthlessContinuation("## Backend Risks\n\nPool exhaustion under load."),
      false,
    );
  });

  it("collapses triple [APPROVE] spam on merge", () => {
    const merged = mergeContinuationText(
      "Looks good.\n\n[APPROVE]",
      "no continuation needed\n\n[APPROVE]\n\n[APPROVE]",
    );
    assert.equal((merged.match(/\[APPROVE\]/gi) ?? []).length, 1);
    assert.doesNotMatch(merged, /no continuation needed/i);
  });

  it("sanitizeMergedContinuation keeps a single trailing tag", () => {
    const cleaned = sanitizeMergedContinuation(
      "All resolved.\n\n[APPROVE]\n\n[APPROVE]",
    );
    assert.equal((cleaned.match(/\[APPROVE\]/gi) ?? []).length, 1);
  });
});

describe("postApproveTruncation summary telemetry", () => {
  it("stores cleared flag when recovery succeeds path writes false", () => {
    const summary = buildRunSummaryPayload({
      debateOutcome: "approved",
      turnCount: 9,
      postApproveTruncation: false,
      debateDurationMs: 100_000,
      artifactDurationMs: 40_000,
      totalDurationMs: computeTotalDurationMs({
        debateDurationMs: 100_000,
        artifactDurationMs: 40_000,
      }),
    });
    const parsed = parseRunSummary(summary);
    assert.equal(parsed?.debateOutcome, "approved");
    assert.equal(parsed?.postApproveTruncation, false);
    assert.equal(parsed?.totalDurationMs, 140_000);
  });
});

describe("physical template path remains gated", () => {
  it("does not prefer near-cap approve changes for physical ops follow-up", () => {
    const state = buildState({
      turnCount: 14,
      returnToReviewer: true,
      lastRejectTarget: "architect",
      lastRejectFeedback: "ops gap",
    });
    const ctx = buildCtx("physical");
    const evaluation = evaluateOpsFollowUpTrigger(state, ctx);
    assert.equal(evaluation.shouldTrigger, false);
    assert.equal(evaluation.skipReason, "not_software_template");
  });
});
