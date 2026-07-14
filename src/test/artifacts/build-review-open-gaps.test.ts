import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildOpenGapsDirective,
  extractReviewOpenGaps,
} from "@/ai/artifacts/build-review-open-gaps";

describe("extractReviewOpenGaps", () => {
  it("extracts UNRESOLVED reviewer items with topic keys", () => {
    const gaps = extractReviewOpenGaps([
      {
        role: "reviewer",
        agentName: "Blake",
        content: [
          "**1. Outbox Poller Crash — Unclaimed Rows (UNRESOLVED)**",
          "Skyler's outbox pattern has a crash window. Mitigation: claimed_by column.",
        ].join("\n"),
      },
    ]);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.topicKey, "outbox_claimed_by");
    assert.match(gaps[0]!.excerpt, /UNRESOLVED/);
  });

  it("extracts Disagree items as open gaps", () => {
    const gaps = extractReviewOpenGaps([
      {
        role: "reviewer",
        agentName: "Blake",
        content:
          "**Disagree**. Marcus lacks the session expiry warning. The blast radius is significant.",
      },
    ]);

    assert.equal(gaps.length, 1);
    assert.equal(gaps[0]!.topicKey, "session_expiry_warning");
  });

  it("returns an empty list when the reviewer found no open gaps", () => {
    const gaps = extractReviewOpenGaps([
      {
        role: "backend",
        agentName: "Skyler",
        content: "Backend API plan complete.",
      },
      {
        role: "reviewer",
        agentName: "Blake",
        content: "**Agree**. All mitigations exist in prior teammate messages. [APPROVE]",
      },
    ]);

    assert.equal(gaps.length, 0);
  });
});

describe("buildOpenGapsDirective", () => {
  it("lists open gaps with do-not-implement language", () => {
    const directive = buildOpenGapsDirective([
      {
        topicKey: "per_provider_queues",
        excerpt: "Worker starvation from shared BullMQ queue (UNRESOLVED)",
        ownerRole: "backend",
      },
    ]);

    assert.match(directive, /NOT resolved in the debate/);
    assert.match(directive, /Do NOT describe them as implemented/);
    assert.match(directive, /shared BullMQ queue/);
  });
});
