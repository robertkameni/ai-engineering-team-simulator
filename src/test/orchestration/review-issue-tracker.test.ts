// Phase 2C — Structured resolution tracking tests
//
// STRUCTURED RESOLUTION TRACKING
// REVIEW ISSUE STATE

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createReviewIssues,
  markIssuesAttempted,
  markIssuesFailedValidation,
  markIssuesAddressed,
  buildIssueSnapshot,
  type ReviewIssue,
} from "@/ai/orchestration/review-issue-tracker";

const FEEDBACK_WITH_CONCERNS = `**Disagree** The caching strategy needs clarification.

**UNRESOLVED** Observability tooling was not finalized.

**Refine** The API contract for user endpoints is inconsistent with the proposed data model.`;

describe("createReviewIssues", () => {
  it("creates issues from reviewer rejection feedback", () => {
    const issues = createReviewIssues([], "backend", FEEDBACK_WITH_CONCERNS, 0, 3);

    assert.ok(issues.length >= 2, `Expected at least 2 issues, got ${issues.length}`);
    for (const issue of issues) {
      assert.strictEqual(issue.targetRole, "backend");
      assert.strictEqual(issue.status, "open");
      assert.strictEqual(issue.createdOnCycle, 0);
      assert.strictEqual(issue.lastConfirmedOnTurn, 3);
      assert.ok(issue.id.startsWith("ri_"));
      assert.ok(issue.keywords.length >= 2);
      assert.ok(issue.excerpt.length > 0);
    }

    assert.ok(
      issues.some((i) => i.excerpt.toLowerCase().includes("caching")),
      "Expected a caching-related issue",
    );
  });

  it("reactivates existing issues as still_open when the same concern reappears", () => {
    const existing: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching", "strategy", "clarification"],
        excerpt: "The caching strategy needs clarification",
        status: "attempted",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 4,
        lastConfirmedOnTurn: 1,
      },
    ];

    const newIssues = createReviewIssues(
      existing,
      "backend",
      "**Disagree** The caching strategy needs clarification.",
      1,
      7,
    );

    assert.strictEqual(newIssues.length, 0, "Should not create duplicates");
    assert.strictEqual(existing[0]!.status, "still_open");
    assert.strictEqual(existing[0]!.lastConfirmedOnTurn, 7);
  });

  it("deduplicates by keyword overlap", () => {
    const existing: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["observability", "tooling", "finalized"],
        excerpt: "Observability tooling was not finalized",
        status: "attempted",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 3,
        lastConfirmedOnTurn: 0,
      },
    ];

    const newIssues = createReviewIssues(
      existing,
      "backend",
      "**UNRESOLVED** Observability tooling was not finalized.",
      1,
      6,
    );

    assert.strictEqual(newIssues.length, 0, "Should not create duplicates");
    assert.strictEqual(existing[0]!.status, "still_open");
  });
});

describe("markIssuesAttempted", () => {
  it("marks open issues for the target role as attempted", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_2",
        targetRole: "architect",
        keywords: ["api"],
        excerpt: "API concern",
        status: "open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
    ];

    markIssuesAttempted(issues, "backend", 5);

    assert.strictEqual(issues[0]!.status, "attempted");
    assert.strictEqual(issues[0]!.lastAttemptedOnTurn, 5);
    assert.strictEqual(issues[1]!.status, "open", "architect issues should not change");
  });

  it("marks still_open issues as attempted", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "still_open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
    ];

    markIssuesAttempted(issues, "backend", 7);

    assert.strictEqual(issues[0]!.status, "attempted");
    assert.strictEqual(issues[0]!.lastAttemptedOnTurn, 7);
  });

  it("does not change already addressed issues", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "addressed",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 5,
        lastConfirmedOnTurn: 1,
      },
    ];

    markIssuesAttempted(issues, "backend", 9);

    assert.strictEqual(issues[0]!.status, "addressed");
  });
});

describe("markIssuesFailedValidation", () => {
  it("marks non-addressed issues as failed_validation for the target role", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "attempted",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 5,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_2",
        targetRole: "backend",
        keywords: ["observability"],
        excerpt: "Observability concern",
        status: "open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_3",
        targetRole: "architect",
        keywords: ["api"],
        excerpt: "API concern",
        status: "still_open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
    ];

    markIssuesFailedValidation(issues, "backend");

    assert.strictEqual(issues[0]!.status, "failed_validation");
    assert.strictEqual(issues[1]!.status, "failed_validation");
    assert.strictEqual(issues[2]!.status, "still_open", "architect issues should not change");
  });

  it("leaves addressed issues unchanged", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "addressed",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 5,
        lastConfirmedOnTurn: 1,
      },
    ];

    markIssuesFailedValidation(issues, "backend");

    assert.strictEqual(issues[0]!.status, "addressed");
  });
});

describe("markIssuesAddressed", () => {
  it("marks all issues as addressed regardless of role", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_2",
        targetRole: "architect",
        keywords: ["api"],
        excerpt: "API concern",
        status: "attempted",
        createdOnCycle: 0,
        lastAttemptedOnTurn: 5,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_3",
        targetRole: "frontend",
        keywords: ["ui"],
        excerpt: "UI concern",
        status: "failed_validation",
        createdOnCycle: 1,
        lastAttemptedOnTurn: 6,
        lastConfirmedOnTurn: 3,
      },
    ];

    markIssuesAddressed(issues);

    assert.strictEqual(issues[0]!.status, "addressed");
    assert.strictEqual(issues[1]!.status, "addressed");
    assert.strictEqual(issues[2]!.status, "addressed");
  });
});

describe("buildIssueSnapshot", () => {
  it("computes correct summary statistics", () => {
    const issues: ReviewIssue[] = [
      {
        id: "ri_1",
        targetRole: "backend",
        keywords: ["caching"],
        excerpt: "Caching concern",
        status: "open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_2",
        targetRole: "backend",
        keywords: ["observability"],
        excerpt: "Observability concern",
        status: "still_open",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_3",
        targetRole: "architect",
        keywords: ["api"],
        excerpt: "API concern",
        status: "failed_validation",
        createdOnCycle: 0,
        lastAttemptedOnTurn: null,
        lastConfirmedOnTurn: 1,
      },
      {
        id: "ri_4",
        targetRole: "frontend",
        keywords: ["ui"],
        excerpt: "UI concern",
        status: "addressed",
        createdOnCycle: 1,
        lastAttemptedOnTurn: 6,
        lastConfirmedOnTurn: 3,
      },
    ];

    const snapshot = buildIssueSnapshot(issues);

    assert.strictEqual(snapshot.totalCreated, 4);
    assert.strictEqual(snapshot.totalOpen, 2);
    assert.strictEqual(snapshot.totalFailed, 1);
  });

  it("handles empty issues array", () => {
    const snapshot = buildIssueSnapshot([]);

    assert.strictEqual(snapshot.totalCreated, 0);
    assert.strictEqual(snapshot.totalOpen, 0);
    assert.strictEqual(snapshot.totalFailed, 0);
  });
});

describe("structured issue lifecycle — end-to-end", () => {
  it("reviewer reject → correction attempt → failed validation → re-reject → addressed", () => {
    let allIssues: ReviewIssue[] = [];

    // Step 1: Reviewer rejects backend
    const cycle0 = createReviewIssues(
      allIssues,
      "backend",
      FEEDBACK_WITH_CONCERNS,
      0,
      3,
    );
    allIssues.push(...cycle0);
    assert.ok(allIssues.length >= 2);
    assert.ok(allIssues.every((i) => i.status === "open"));

    // Step 2: Correction turn marks issues as attempted
    markIssuesAttempted(allIssues, "backend", 5);
    assert.ok(
      allIssues.every((i) => i.status === "attempted"),
      `Expected all attempted, got: ${allIssues.map((i) => `${i.status}`).join(", ")}`,
    );

    // Step 3: Validation fails
    markIssuesFailedValidation(allIssues, "backend");
    assert.ok(
      allIssues.every((i) => i.status === "failed_validation"),
      `Expected all failed_validation, got: ${allIssues.map((i) => `${i.status}`).join(", ")}`,
    );

    // Step 4: Reviewer rejects again (same concerns) — issues reactivated as still_open
    const cycle1 = createReviewIssues(
      allIssues,
      "backend",
      FEEDBACK_WITH_CONCERNS,
      1,
      8,
    );
    allIssues.push(...cycle1);
    assert.ok(
      allIssues.every(
        (i) => i.status === "still_open" || i.status === "failed_validation",
      ),
    );

    // Step 5: Reviewer finally approves
    markIssuesAddressed(allIssues);
    assert.ok(allIssues.every((i) => i.status === "addressed"));

    const snapshot = buildIssueSnapshot(allIssues);
    assert.strictEqual(snapshot.totalOpen, 0);
    assert.strictEqual(snapshot.totalCreated, allIssues.length);
  });
});
