import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  buildFocusedOpsFollowUpContext,
  buildFocusedOpsFollowUpPrompt,
  canScheduleOpsFollowUp,
  collectUnresolvedDevOpsBlockers,
  evaluateOpsFollowUpTrigger,
  extractDevOpsOwnedOperationalBlockers,
  hasOperationalOpenGaps,
  isArchitectCorrectionAfterReview,
  isSoftwareTemplate,
  markDevOpsOperationalIssuesAttempted,
  matchesOperationalCategory,
  recordOpsFollowUpCheckpoint,
  resolveLastCorrectionRole,
  scheduleOpsFollowUpTurn,
  selectOpsFollowUpSummary,
  shouldTriggerOpsFollowUp,
} from "@/ai/orchestration/ops-follow-up";
import { createReviewIssues } from "@/ai/orchestration/review-issue-tracker";
import { getMaxSimulationTurns } from "@/ai/orchestration/reviewer-decision";
import type { ReviewIssue } from "@/ai/orchestration/review-issue-tracker";
import type { DebateState, TurnContext } from "@/ai/orchestration/run-simulation-types";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const buildStudyGroupReviewerFeedback = (devopsName: string): string => `
## Actionable Recommendations

1. **Taylor**: Reduce the pg_cron recovery interval for missing MATCH_RECOMPUTE jobs from 15 minutes to 2 minutes.

2. **Taylor**: Implement concurrent refresh token tolerance by storing the last 5 refresh token hashes per user.

3. **${devopsName}**: Add a monthly GitHub Actions workflow that performs a full restore of the latest backup to a test database and runs integrity checks. Acceptance criterion: the workflow must complete successfully at least once before the v1 launch.

4. **Kai**: Add a 10-second timeout on optimistic invite state.

5. **${devopsName}**: Add a \`pending_match_recompute_age_seconds\` metric to the worker's \`/healthz\` endpoint, with an alert threshold of 30 seconds.

## Critical Risks

4. **Data loss — backup restore testing**: ${devopsName}'s plan includes nightly pg_dump but no tested restore procedure. **UNRESOLVED.** The mitigation must appear in ${devopsName}'s message, not Skyler's.

5. **Silent operational degradation — dead letter queue growth**: ${devopsName}'s health check does not include dead letter growth alert. **UNRESOLVED.**
`;

const SUBSCRIPTION_STYLE_FEEDBACK = (devopsName: string): string => `
**Disagree** The sync-cycle alert threshold is too coarse for production.

4. **Data loss — backup restore testing**: ${devopsName}'s plan includes nightly pg_dump but no tested restore procedure. **UNRESOLVED.**

5. **Silent operational degradation — dead letter queue growth**: Health check does not include dead letter growth alert. **UNRESOLVED.**
`;

const ARCHITECT_ONLY_FEEDBACK = `
**Disagree** The normalized schema should split CourseEnrollment from AvailabilityProfile.

**Refine** The API pagination contract is inconsistent with the frontend dashboard needs.
`;

const BACKEND_ONLY_FEEDBACK = `
**UNRESOLVED** The outbox poller can return stale reads when claimed_by is not reset after worker crash.

**Refine** The invite acceptance endpoint does not enforce idempotency on duplicate POST requests.
`;

function buildBaseState(
  devopsName: string,
  overrides: Partial<DebateState> = {},
): DebateState {
  return {
    turnCount: 10,
    roleIndex: 0,
    returnToReviewer: true,
    nextRole: "architect",
    lastRejectFeedback: buildStudyGroupReviewerFeedback(devopsName),
    lastRejectTarget: "architect",
    reviewerRejectionCount: 1,
    roleCorrectionCounts: { architect: 1 },
    transcript: [
      { role: "reviewer", agentName: "Marcus", content: "Initial review" },
      { role: "architect", agentName: "Skyler", content: "Architect correction" },
    ],
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
    ...overrides,
  };
}

function buildTurnContext(templateId: "software" | "physical" | "hybrid" = "software"): TurnContext {
  const roster = createSimulationRoster(templateId);
  return {
    runId: "run_test",
    productIdea: "Study group matching platform",
    roster,
    templateId,
    usageAccumulator: new RunUsageAccumulator(),
    notify: () => {},
  };
}

describe("operational gap detection", () => {
  it("matches operational categories", () => {
    assert.equal(matchesOperationalCategory("Add a monthly backup restore workflow"), true);
    assert.equal(matchesOperationalCategory("Normalize the user table schema"), false);
  });

  it("extracts DevOps-owned operational blockers from study-group-style feedback", () => {
    const roster = createSimulationRoster("software");
    const feedback = buildStudyGroupReviewerFeedback(roster.devops.name);
    const blockers = extractDevOpsOwnedOperationalBlockers(
      feedback,
      roster,
      "architect",
    );

    assert.ok(blockers.length >= 2);
    assert.ok(blockers.some((line) => /backup|restore/i.test(line)));
    assert.ok(blockers.some((line) => /healthz|recompute|dead letter/i.test(line)));
  });

  it("extracts DevOps blockers from subscription-style feedback without explicit role tags", () => {
    const roster = createSimulationRoster("software");
    const feedback = SUBSCRIPTION_STYLE_FEEDBACK(roster.devops.name);
    const blockers = extractDevOpsOwnedOperationalBlockers(
      feedback,
      roster,
      "architect",
    );

    assert.ok(blockers.length >= 2);
  });

  it("does not treat architect-only feedback as operational DevOps gaps", () => {
    const roster = createSimulationRoster("software");
    const blockers = extractDevOpsOwnedOperationalBlockers(
      ARCHITECT_ONLY_FEEDBACK,
      roster,
      "architect",
    );

    assert.equal(blockers.length, 0);
    assert.equal(
      hasOperationalOpenGaps([], ARCHITECT_ONLY_FEEDBACK, roster, "architect"),
      false,
    );
  });

  it("does not treat backend-only feedback as DevOps gaps", () => {
    const roster = createSimulationRoster("software");
    const blockers = extractDevOpsOwnedOperationalBlockers(
      BACKEND_ONLY_FEEDBACK,
      roster,
      "backend",
    );

    assert.equal(blockers.length, 0);
  });
});

describe("shouldTriggerOpsFollowUp", () => {
  it("routes DevOps before reviewer after architect correction with ops gaps", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name);
    assert.equal(isArchitectCorrectionAfterReview(state.transcript), true);
    assert.equal(shouldTriggerOpsFollowUp(state, ctx), true);

    const evaluation = evaluateOpsFollowUpTrigger(state, ctx);
    scheduleOpsFollowUpTurn(state, ctx, evaluation);

    assert.equal(state.nextRole, "devops");
    assert.equal(state.returnToReviewer, true);
    assert.equal(state.hasHadOpsFollowUpForCurrentReject, true);
    assert.ok(state.focusedOpsFollowUp);
    assert.ok(state.focusedOpsFollowUp!.blockers.length >= 2);
  });

  it("fixes reviewer-architect-reviewer gap using structured issue ownership", () => {
    const ctx = buildTurnContext("software");
    const feedback = SUBSCRIPTION_STYLE_FEEDBACK(ctx.roster.devops.name);
    const reviewIssues = createReviewIssues(
      [],
      "architect",
      feedback,
      0,
      8,
      ctx.roster,
    );

    const state = buildBaseState(ctx.roster.devops.name, {
      lastRejectFeedback: feedback,
      reviewIssues,
    });

    const evaluation = evaluateOpsFollowUpTrigger(state, ctx);
    assert.equal(evaluation.shouldTrigger, true);
    assert.ok(reviewIssues.some((issue) => issue.targetRole === "devops"));
    assert.ok(reviewIssues.length >= 2);

    scheduleOpsFollowUpTurn(state, ctx, evaluation);
    assert.equal(state.nextRole, "devops");
  });

  it("does not trigger for non-operational reviewer feedback", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, {
      lastRejectFeedback: ARCHITECT_ONLY_FEEDBACK,
    });

    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "no_unresolved_devops_issues",
    );
  });

  it("allows only one ops follow-up per rejection cluster", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, {
      hasHadOpsFollowUpForCurrentReject: true,
    });

    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "already_triggered_for_reject_cluster",
    );
  });

  it("blocks ops follow-up when turn budget is insufficient", () => {
    const maxTurns = getMaxSimulationTurns("software");
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, { turnCount: maxTurns - 1 });

    assert.equal(canScheduleOpsFollowUp(state.turnCount, maxTurns), false);
    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "insufficient_turn_budget",
    );
  });

  it("does not trigger for physical-template runs", () => {
    const ctx = buildTurnContext("physical");
    const state = buildBaseState(ctx.roster.devops.name);

    assert.equal(isSoftwareTemplate("physical"), false);
    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "not_software_template",
    );
  });

  it("does not trigger when the rejected role is already DevOps", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, { lastRejectTarget: "devops" });

    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "reject_target_is_devops",
    );
  });

  it("does not trigger when architect correction failed validation", () => {
    const transcript: TranscriptEntry[] = [
      { role: "reviewer", agentName: "Marcus", content: "Review" },
      {
        role: "architect",
        agentName: "Skyler",
        content: "Failed correction",
        isCorrectionFailed: true,
      },
    ];
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, { transcript });

    assert.equal(isArchitectCorrectionAfterReview(transcript), false);
    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.equal(
      evaluateOpsFollowUpTrigger(state, ctx).skipReason,
      "not_architect_correction_after_review",
    );
  });

  it("does not misroute backend-only issues to DevOps", () => {
    const ctx = buildTurnContext("software");
    const reviewIssues = createReviewIssues(
      [],
      "backend",
      BACKEND_ONLY_FEEDBACK,
      0,
      8,
      ctx.roster,
    );
    const state = buildBaseState(ctx.roster.devops.name, {
      lastRejectFeedback: BACKEND_ONLY_FEEDBACK,
      lastRejectTarget: "backend",
      transcript: [
        { role: "reviewer", agentName: "Marcus", content: "Review" },
        { role: "backend", agentName: "Kai", content: "Backend correction" },
      ],
      reviewIssues,
    });

    assert.equal(shouldTriggerOpsFollowUp(state, ctx), false);
    assert.ok(reviewIssues.every((issue) => issue.targetRole === "backend"));
  });
});

describe("focused ops follow-up prompt", () => {
  it("scopes DevOps to operational closure blockers only", () => {
    const roster = createSimulationRoster("software");
    const feedback = buildStudyGroupReviewerFeedback(roster.devops.name);
    const blockers = collectUnresolvedDevOpsBlockers([], feedback, roster, "architect");
    const context = buildFocusedOpsFollowUpContext(
      roster,
      feedback,
      blockers,
      "Architect already split workers and updated ADR-003.",
    );
    const prompt = buildFocusedOpsFollowUpPrompt(context);

    assert.match(prompt, /FOCUSED OPERATIONAL CLOSURE TURN/);
    assert.match(prompt, /do not reopen the full system design/i);
    assert.match(prompt, /Operational Closure/);
    assert.match(prompt, /Architect correction already delivered/);
    assert.ok(context.blockers.length >= 2);
  });
});

describe("ops follow-up observability checkpoint", () => {
  it("records triggered architect-path evaluation", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name);

    const evaluation = recordOpsFollowUpCheckpoint(state, ctx);
    const checkpoint = state.opsFollowUpCheckpoint;

    assert.equal(evaluation?.shouldTrigger, true);
    assert.equal(checkpoint?.opsFollowUpEvaluated, true);
    assert.equal(checkpoint?.opsFollowUpEligible, true);
    assert.equal(checkpoint?.opsFollowUpTriggered, true);
    assert.equal(checkpoint?.opsFollowUpSkipReason, null);
    assert.equal(checkpoint?.opsFollowUpLastCorrectionRole, "architect");
    assert.equal(checkpoint?.opsFollowUpUnresolvedDevopsIssueCount >= 2, true);
    assert.equal(checkpoint?.opsFollowUpEvaluationTurn, 10);

    assert.equal(state.opsFollowUpCheckpoints.length, 1);
    assert.equal(state.opsFollowUpCheckpoints[0], checkpoint);
  });

  it("records skipped no-gap architect-path evaluation", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, {
      lastRejectFeedback: ARCHITECT_ONLY_FEEDBACK,
    });

    recordOpsFollowUpCheckpoint(state, ctx);
    const checkpoint = state.opsFollowUpCheckpoint;

    assert.equal(checkpoint?.opsFollowUpEvaluated, true);
    assert.equal(checkpoint?.opsFollowUpTriggered, false);
    assert.equal(checkpoint?.opsFollowUpEligible, false);
    assert.equal(
      checkpoint?.opsFollowUpSkipReason,
      "no_unresolved_devops_issues",
    );
    assert.equal(checkpoint?.opsFollowUpLastCorrectionRole, "architect");
    assert.equal(checkpoint?.opsFollowUpUnresolvedDevopsIssueCount, 0);

    assert.equal(state.opsFollowUpCheckpoints.length, 1);
    assert.equal(state.opsFollowUpCheckpoints[0], checkpoint);
  });

  it("triggers ops follow-up on mid-debate backend correction when DevOps issues remain", () => {
    const ctx = buildTurnContext("software");
    const reviewIssues = createReviewIssues(
      [],
      "backend",
      BACKEND_ONLY_FEEDBACK,
      0,
      8,
      ctx.roster,
    );
    const state = buildBaseState(ctx.roster.devops.name, {
      turnCount: 10,
      lastRejectFeedback: SUBSCRIPTION_STYLE_FEEDBACK(ctx.roster.devops.name),
      lastRejectTarget: "backend",
      transcript: [
        { role: "reviewer", agentName: "Marcus", content: "Review" },
        { role: "backend", agentName: "Kai", content: "Backend correction" },
      ],
      reviewIssues,
    });

    recordOpsFollowUpCheckpoint(state, ctx);
    const checkpoint = state.opsFollowUpCheckpoint;

    assert.equal(resolveLastCorrectionRole(state.transcript), "backend");
    assert.equal(checkpoint?.opsFollowUpEvaluated, true);
    assert.equal(checkpoint?.opsFollowUpTriggered, true);
    assert.equal(checkpoint?.opsFollowUpEligible, true);
    assert.equal(checkpoint?.opsFollowUpSkipReason, null);
    assert.equal(checkpoint?.opsFollowUpLastCorrectionRole, "backend");
    assert.ok((checkpoint?.opsFollowUpUnresolvedDevopsIssueCount ?? 0) >= 2);

    assert.equal(state.opsFollowUpCheckpoints.length, 1);
    assert.equal(state.opsFollowUpCheckpoints[0], checkpoint);
  });

  it("triggers ops follow-up on near-cap backend correction with unresolved DevOps issues", () => {
    const ctx = buildTurnContext("software");
    const maxTurns = getMaxSimulationTurns("software");
    const reviewIssues = createReviewIssues(
      [],
      "backend",
      BACKEND_ONLY_FEEDBACK,
      0,
      maxTurns - 2,
      ctx.roster,
    );
    const state = buildBaseState(ctx.roster.devops.name, {
      turnCount: maxTurns - 2,
      lastRejectFeedback: SUBSCRIPTION_STYLE_FEEDBACK(ctx.roster.devops.name),
      lastRejectTarget: "backend",
      transcript: [
        { role: "reviewer", agentName: "Marcus", content: "Review" },
        { role: "backend", agentName: "Kai", content: "Backend correction" },
      ],
      reviewIssues,
    });

    recordOpsFollowUpCheckpoint(state, ctx);
    const checkpoint = state.opsFollowUpCheckpoint;

    assert.equal(resolveLastCorrectionRole(state.transcript), "backend");
    assert.equal(checkpoint?.opsFollowUpEvaluated, true);
    assert.equal(checkpoint?.opsFollowUpTriggered, true);
    assert.equal(checkpoint?.opsFollowUpEligible, true);
    assert.equal(checkpoint?.opsFollowUpSkipReason, null);
    assert.equal(checkpoint?.opsFollowUpLastCorrectionRole, "backend");
    assert.ok((checkpoint?.opsFollowUpUnresolvedDevopsIssueCount ?? 0) >= 2);
  });
});

describe("checkpoint history and selectOpsFollowUpSummary", () => {
  it("selectOpsFollowUpSummary returns null for both when no checkpoints exist", () => {
    const summary = selectOpsFollowUpSummary([]);
    assert.equal(summary.last, null);
    assert.equal(summary.relevantArchitect, null);
  });

  it("selectOpsFollowUpSummary returns the same reference for last and relevantArchitect when the only checkpoint is architect", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name);

    recordOpsFollowUpCheckpoint(state, ctx);

    const summary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);
    assert.equal(summary.last?.opsFollowUpLastCorrectionRole, "architect");
    assert.equal(summary.relevantArchitect?.opsFollowUpLastCorrectionRole, "architect");
    assert.equal(summary.last, summary.relevantArchitect);
  });

  it("preserves architect checkpoint when a later frontend correction overwrites last", () => {
    const ctx = buildTurnContext("software");

    // Cycle 1: architect correction with DevOps gaps — trigger fires
    const state = buildBaseState(ctx.roster.devops.name);
    recordOpsFollowUpCheckpoint(state, ctx);

    assert.equal(state.opsFollowUpCheckpoints.length, 1);
    assert.equal(
      state.opsFollowUpCheckpoints[0]!.opsFollowUpLastCorrectionRole,
      "architect",
    );
    assert.equal(state.opsFollowUpCheckpoints[0]!.opsFollowUpTriggered, true);

    // Cycle 2: frontend correction with no DevOps gaps
    state.transcript = [
      { role: "reviewer", agentName: "Marcus", content: "Second review" },
      { role: "frontend", agentName: "Dana", content: "Frontend correction" },
    ];
    state.lastRejectFeedback = ARCHITECT_ONLY_FEEDBACK;
    state.lastRejectTarget = "frontend";
    state.turnCount = 14;

    recordOpsFollowUpCheckpoint(state, ctx);

    assert.equal(state.opsFollowUpCheckpoints.length, 2);
    assert.equal(
      state.opsFollowUpCheckpoints[1]!.opsFollowUpLastCorrectionRole,
      "frontend",
    );

    const summary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);

    assert.equal(summary.last?.opsFollowUpLastCorrectionRole, "frontend");
    assert.equal(summary.relevantArchitect?.opsFollowUpLastCorrectionRole, "architect");
    assert.notEqual(summary.last, summary.relevantArchitect);

    // The architect cycle is the one that triggered
    assert.equal(summary.relevantArchitect?.opsFollowUpTriggered, true);
    assert.equal(summary.relevantArchitect?.opsFollowUpEvaluationTurn, 10);

    // The frontend cycle did not trigger — architect guard fires before gap check
    assert.equal(summary.last?.opsFollowUpTriggered, false);
    assert.equal(summary.last?.opsFollowUpSkipReason, "not_architect_correction_after_review");
    assert.equal(summary.last?.opsFollowUpEvaluationTurn, 14);
  });

  it("returns null relevantArchitect when no architect correction occurred", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name, {
      transcript: [
        { role: "reviewer", agentName: "Marcus", content: "Review" },
        { role: "frontend", agentName: "Dana", content: "Frontend correction" },
      ],
      lastRejectTarget: "frontend",
      lastRejectFeedback: ARCHITECT_ONLY_FEEDBACK,
    });

    recordOpsFollowUpCheckpoint(state, ctx);

    const summary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);
    assert.equal(summary.last?.opsFollowUpLastCorrectionRole, "frontend");
    assert.equal(summary.relevantArchitect, null);
  });

  it("selectOpsFollowUpSummary picks the most recent architect checkpoint when there are multiple", () => {
    const ctx = buildTurnContext("software");

    // Two architect correction cycles
    const state = buildBaseState(ctx.roster.devops.name);
    recordOpsFollowUpCheckpoint(state, ctx);

    state.transcript = [
      { role: "reviewer", agentName: "Marcus", content: "Second review" },
      { role: "architect", agentName: "Skyler", content: "Architect second correction" },
    ];
    state.turnCount = 14;

    recordOpsFollowUpCheckpoint(state, ctx);

    assert.equal(state.opsFollowUpCheckpoints.length, 2);

    const summary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);
    // Both last and relevantArchitect should be the second architect checkpoint
    assert.equal(summary.last, summary.relevantArchitect);
    assert.equal(summary.last?.opsFollowUpEvaluationTurn, 14);
  });

  it("architectCheckpoint from selectOpsFollowUpSummary is undefined (not separate) when architect is last correction", () => {
    const ctx = buildTurnContext("software");
    const state = buildBaseState(ctx.roster.devops.name);

    recordOpsFollowUpCheckpoint(state, ctx);

    const summary = selectOpsFollowUpSummary(state.opsFollowUpCheckpoints);
    // When architect IS the last correction, relevantArchitect === last — no separate field needed
    const architectCheckpoint =
      summary.relevantArchitect !== summary.last ? summary.relevantArchitect : undefined;

    assert.equal(architectCheckpoint, undefined);
  });
});

describe("review issue tracking compatibility", () => {
  it("marks DevOps operational issues as attempted during ops follow-up", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "devops",
        keywords: ["backup", "restore", "testing"],
        excerpt: "Backup restore testing workflow missing",
        status: "open",
        severity: "blocker",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 8,
      },
      {
        id: "ri_2",
        targetRole: "architect",
        keywords: ["schema", "normalization"],
        excerpt: "Schema normalization gap",
        status: "open",
        severity: "blocker",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 8,
      },
    ];

    markDevOpsOperationalIssuesAttempted(issues, 11);

    assert.equal(issues[0]!.status, "attempted");
    assert.equal(issues[0]!.lastAttemptedOnTurn, 11);
    assert.equal(issues[1]!.status, "open");
  });
});
