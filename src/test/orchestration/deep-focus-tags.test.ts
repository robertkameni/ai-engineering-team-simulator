import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "@/ai/agents/roster";
import {
  excerptAroundChallengeTag,
  parseDeepFocusTags,
} from "@/ai/orchestration/deep-focus-tags";

const roster = createSimulationRoster("software");

describe("parseDeepFocusTags", () => {
  it("reads challenge, evidence, and blocked tags", () => {
    const tags = parseDeepFocusTags(
      "Queue split is required. [CHALLENGE: architect] [EVIDENCE: restore-drill.yml] [BLOCKED: smtp-pin]",
    );

    assert.deepEqual(tags.challenges, ["architect"]);
    assert.deepEqual(tags.evidence, ["restore-drill.yml"]);
    assert.deepEqual(tags.blocked, ["smtp-pin"]);
  });

  it("ignores reviewer as a challenge target and dedupes roles", () => {
    const tags = parseDeepFocusTags(
      "[CHALLENGE: reviewer] [CHALLENGE: backend] [CHALLENGE: backend]",
    );

    assert.deepEqual(tags.challenges, ["backend"]);
  });

  it("resolves a challenge tag that uses a teammate display name", () => {
    const tags = parseDeepFocusTags(
      `Vendor toggles are not reliable. [CHALLENGE: ${roster.pm.name}]`,
      roster,
    );

    assert.deepEqual(tags.challenges, ["pm"]);
  });

  it("excerpts the window around a challenge tag", () => {
    const text =
      "Blake's single queue starves PDF jobs under photo flood. [CHALLENGE: architect] Split queues instead.";

    const excerpt = excerptAroundChallengeTag(text, "architect");

    assert.ok(excerpt);
    assert.match(excerpt, /\[CHALLENGE: architect\]/);
    assert.match(excerpt, /starves PDF/);
  });
});
