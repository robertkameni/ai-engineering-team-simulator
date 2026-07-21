import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  buildIssueSnapshot,
  createReviewIssueBaseline,
  createReviewIssues,
  createReviewIssuesWithinBaseline,
  markIssuesAcceptedRisk,
  markIssuesAddressed,
  markIssuesAttempted,
  type ReviewIssue,
} from "@/ai/orchestration/review-issue-tracker";

const SOFTWARE_ROSTER = createSimulationRoster("software");

const FEEDBACK_WITH_CONCERNS = `**Disagree** The caching strategy needs clarification.

**UNRESOLVED** Observability tooling was not finalized.

**Refine** The API contract for user endpoints is inconsistent with the proposed data model.`;

function buildOpenIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    id: "ri_1",
    targetRole: "devops",
    keywords: ["backup", "restore", "testing"],
    excerpt: "Backup restore testing workflow missing",
    status: "open",
    severity: "blocker",
    createdOnCycle: 0,
    lastAttemptedOnTurn: null,
    lastConfirmedOnTurn: 8,
    acceptedRisk: null,
    ...overrides,
  };
}

describe("createReviewIssues", () => {
  it("creates open issues from reviewer rejection feedback", () => {
    const issues = createReviewIssues(
      [],
      "backend",
      FEEDBACK_WITH_CONCERNS,
      0,
      3,
      SOFTWARE_ROSTER,
    );

    assert.ok(issues.length >= 2);
    assert.ok(issues.every((issue) => issue.status === "open"));
    assert.ok(issues.every((issue) => issue.acceptedRisk === null));
  });

  it("keeps resolved issues closed when concerns reappear", () => {
    const addressed = buildOpenIssue({
      targetRole: "backend",
      keywords: ["caching", "strategy", "clarification"],
      excerpt: "The caching strategy needs clarification",
      status: "addressed",
    });

    const acceptedRisk = buildOpenIssue({
      id: "ri_2",
      targetRole: "devops",
      keywords: ["observability", "tooling", "finalized"],
      excerpt: "Observability tooling was not finalized",
      status: "accepted_risk",
      acceptedRisk: {
        reason: "Known launch tradeoff",
        acceptedByRole: "reviewer",
        acceptedOnTurn: 9,
      },
    });

    const newIssues = createReviewIssues(
      [addressed, acceptedRisk],
      "backend",
      `**Disagree** The caching strategy needs clarification.

**UNRESOLVED** Observability tooling was not finalized.`,
      1,
      12,
      SOFTWARE_ROSTER,
    );

    assert.equal(newIssues.length, 0);
    assert.equal(addressed.status, "addressed");
    assert.equal(acceptedRisk.status, "accepted_risk");
  });
});

describe("monotonic issue transitions", () => {
  it("records attempts without changing active status", () => {
    const issue = buildOpenIssue();
    markIssuesAttempted([issue], "devops", 11);

    assert.equal(issue.status, "open");
    assert.equal(issue.lastAttemptedOnTurn, 11);
  });

  it("moves open issues to addressed", () => {
    const issue = buildOpenIssue();
    markIssuesAddressed([issue]);

    assert.equal(issue.status, "addressed");
  });

  it("does not reopen addressed issues", () => {
    const issue = buildOpenIssue({ status: "addressed" });
    markIssuesAttempted([issue], "devops", 11);
    markIssuesAddressed([issue]);

    assert.equal(issue.status, "addressed");
  });

  it("accepts risk only with a reason", () => {
    const issue = buildOpenIssue();

    assert.throws(
      () => {
        markIssuesAcceptedRisk([issue], {
          reason: "   ",
          acceptedByRole: "reviewer",
          acceptedOnTurn: 13,
        });
      },
      /reason/i,
    );
  });

  it("stores accepted-risk reason and keeps issue closed", () => {
    const issue = buildOpenIssue();

    markIssuesAcceptedRisk([issue], {
      reason: "Restore drills require external environment approval",
      acceptedByRole: "reviewer",
      acceptedOnTurn: 13,
    });
    markIssuesAttempted([issue], "devops", 15);
    markIssuesAddressed([issue]);

    assert.equal(issue.status, "accepted_risk");
    assert.equal(
      issue.acceptedRisk?.reason,
      "Restore drills require external environment approval",
    );
    assert.equal(issue.acceptedRisk?.acceptedByRole, "reviewer");
  });
});

describe("baseline issue scoping", () => {
  it("rejects unrelated issue additions after baseline freeze", () => {
    const existingIssue = buildOpenIssue();
    const baseline = createReviewIssueBaseline([existingIssue]);

    const result = createReviewIssuesWithinBaseline({
      existingIssues: [existingIssue],
      rejectRole: "backend",
      feedbackText:
        "**Disagree** Outbox ordering is unresolved and requires queue semantics.",
      cycleIndex: 1,
      turnCount: 12,
      roster: SOFTWARE_ROSTER,
      baseline,
    });

    assert.equal(result.newIssues.length, 0);
    assert.equal(result.blockedNewIssuesCount > 0, true);
  });

  it("allows re-review to update existing baseline issues", () => {
    const existingIssue = buildOpenIssue({
      targetRole: "backend",
      keywords: ["caching", "strategy", "clarification"],
      excerpt: "The caching strategy needs clarification",
      lastConfirmedOnTurn: 4,
    });
    const baseline = createReviewIssueBaseline([existingIssue]);

    const result = createReviewIssuesWithinBaseline({
      existingIssues: [existingIssue],
      rejectRole: "backend",
      feedbackText: "**Disagree** The caching strategy needs clarification.",
      cycleIndex: 1,
      turnCount: 12,
      roster: SOFTWARE_ROSTER,
      baseline,
    });

    assert.equal(result.newIssues.length, 0);
    assert.equal(result.updatedIssueIds.includes(existingIssue.id), true);
    assert.equal(existingIssue.lastConfirmedOnTurn, 12);
  });
});

describe("buildIssueSnapshot", () => {
  it("computes open/addressed/accepted totals", () => {
    const snapshot = buildIssueSnapshot([
      buildOpenIssue({ id: "ri_1", status: "open" }),
      buildOpenIssue({ id: "ri_2", status: "addressed" }),
      buildOpenIssue({
        id: "ri_3",
        status: "accepted_risk",
        acceptedRisk: {
          reason: "Deferred until phase 2",
          acceptedByRole: "reviewer",
          acceptedOnTurn: 10,
        },
      }),
    ]);

    assert.equal(snapshot.totalCreated, 3);
    assert.equal(snapshot.totalOpen, 1);
    assert.equal(snapshot.totalAddressed, 1);
    assert.equal(snapshot.totalAcceptedRisk, 1);
  });
});
