import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import { buildAgentMessages } from "@/ai/context/build-messages";
import { buildScopedReReviewChecklist } from "@/ai/orchestration/reviewer-preflight";
import { buildCorrectionTurnPrompt, getAgentTurnPrompt } from "@/ai/prompts";

describe("scoped correction and re-review prompts", () => {
  const roster = createSimulationRoster("software");

  it("includes assigned issue IDs and forbids full-plan restatement", () => {
    const prompt = buildCorrectionTurnPrompt(
      "backend",
      roster.reviewer.name,
      "Outbox ordering remains unresolved.",
      false,
      [
        {
          issueId: "ri_outbox",
          excerpt: "Outbox ordering remains unresolved after dual-write.",
        },
      ],
    );

    assert.match(prompt, /ri_outbox/);
    assert.match(prompt, /Address ONLY the assigned issue IDs/i);
    assert.match(prompt, /Prohibit full-plan restatement/i);
    assert.doesNotMatch(prompt, /repost your full prior plan verbatim/i);
  });

  it("omits full preflight on scoped re-review messages", () => {
    const transcript = [
      {
        role: "backend" as const,
        agentName: roster.backend.name,
        content: "## Changes\nFixed outbox ordering with shared transaction.",
      },
    ];

    const messages = buildAgentMessages("reviewer", "Expense splitter", transcript, roster, {
      isReReview: true,
      reReviewTargetRole: "backend",
      reReviewIssues: [
        {
          issueId: "ri_outbox",
          excerpt: "Outbox ordering remains unresolved after dual-write.",
          status: "open",
        },
      ],
    });

    const joined = messages
      .map((message) => (typeof message.content === "string" ? message.content : ""))
      .join("\n");

    assert.match(joined, /Scoped re-review checklist/);
    assert.match(joined, /ri_outbox/);
    assert.doesNotMatch(joined, /Debate pre-flight checklist/);
    assert.doesNotMatch(joined, /Operational signals \(keyword scan\)/);
  });

  it("builds a scoped checklist without pipeline preflight", () => {
    const checklist = buildScopedReReviewChecklist({
      targetRole: "devops",
      roster,
      issues: [
        {
          issueId: "ri_backup",
          excerpt: "Automated restore drill missing.",
          status: "open",
        },
      ],
    });

    assert.match(checklist, /ri_backup/);
    assert.doesNotMatch(checklist, /Pipeline coverage/);
    assert.doesNotMatch(checklist, /FIRST-PASS REVIEW/);
  });

  it("uses the scoped re-review turn prompt", () => {
    const prompt = getAgentTurnPrompt("reviewer", "Expense splitter", roster, "software", {
      isReReview: true,
    });

    assert.match(prompt, /SCOPED RE-REVIEW/i);
    assert.doesNotMatch(prompt, /Surface 3–5 critical risks/);
  });
});
