import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReviewOpenGap } from "@/ai/artifacts/build-review-open-gaps.types";
import {
  buildDeterministicCrossConsistencyFixPrompt,
  findFalseResolutionViolations,
  validateArtifactCrossConsistency,
} from "@/ai/artifacts/validate-artifact-cross-consistency";

const OUTBOX_OPEN_GAP: ReviewOpenGap = {
  topicKey: "outbox_claimed_by",
  excerpt: "Outbox poller crash window (UNRESOLVED)",
  ownerRole: "backend",
};

describe("validateArtifactCrossConsistency", () => {
  it("flags architecture that claims claimed_by when reviewer left it unresolved", () => {
    const violations = validateArtifactCrossConsistency(
      {
        architecture: {
          sections: [
            {
              title: "APIs & Integration",
              items: [
                "The outbox table has a claimed_by column with heartbeat timestamp for crash recovery.",
              ],
            },
          ],
        },
      },
      [OUTBOX_OPEN_GAP],
    );

    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /architecture:/);
    assert.match(violations[0]!, /outbox_claimed_by/);
  });

  it("allows architecture that explicitly marks the gap as unresolved", () => {
    const violations = findFalseResolutionViolations(
      "Reviewer flagged an open gap: outbox claimed_by reclamation is unresolved and only recommended.",
      [OUTBOX_OPEN_GAP],
    );

    assert.equal(violations.length, 0);
  });

  it("returns no violations when there are no reviewer open gaps", () => {
    const violations = validateArtifactCrossConsistency(
      {
        architecture: {
          sections: [
            {
              title: "Decisions",
              items: ["Uses claimed_by on the outbox table."],
            },
          ],
        },
      },
      [],
    );

    assert.equal(violations.length, 0);
  });

  it("flags generic open gaps that appear resolved in architecture", () => {
    const violations = findFalseResolutionViolations(
      "The webhook signature rotation workflow is fully implemented with nightly key rollover.",
      [
        {
          topicKey: "generic",
          excerpt:
            "Webhook signature rotation workflow remains UNRESOLVED in the debate",
          ownerRole: "backend",
        },
      ],
    );

    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /generic open gap/);
  });

  it("ignores generic gaps when shared vocabulary lacks an implementation claim", () => {
    const violations = findFalseResolutionViolations(
      "The architecture discusses webhook signature rotation trade-offs without adopting a final workflow.",
      [
        {
          topicKey: "generic",
          excerpt:
            "Webhook signature rotation workflow remains UNRESOLVED in the debate",
          ownerRole: "backend",
        },
      ],
    );

    assert.equal(violations.length, 0);
  });

  it("includes open gap excerpts in the deterministic cross fix prompt", () => {
    const prompt = buildDeterministicCrossConsistencyFixPrompt(
      ['architecture: claims resolved "outbox_claimed_by" but reviewer marked it UNRESOLVED in the debate'],
      [OUTBOX_OPEN_GAP],
    );

    assert.match(prompt, /CRITICAL cross-artifact consistency fix/);
    assert.match(prompt, /Outbox poller crash window/);
  });
});
