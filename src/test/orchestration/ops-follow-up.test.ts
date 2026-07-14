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
    reviewIssues: [],
    isGateReroute: false,
    hasHadEarlyReview: false,
    hasHadOpsFollowUpForCurrentReject: false,
    focusedOpsFollowUp: null,
    opsFollowUpCheckpoint: null,
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
  });

  it("records backend-path evaluation as out-of-scope for trigger", () => {
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
    assert.equal(checkpoint?.opsFollowUpTriggered, false);
    assert.equal(checkpoint?.opsFollowUpEligible, false);
    assert.equal(
      checkpoint?.opsFollowUpSkipReason,
      "not_architect_correction_after_review",
    );
    assert.equal(checkpoint?.opsFollowUpLastCorrectionRole, "backend");
    assert.ok((checkpoint?.opsFollowUpUnresolvedDevopsIssueCount ?? 0) >= 2);
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
