import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isBackendDeliverableInsufficient,
  isSoftwareArchitectDeliverableInsufficient,
} from "@/ai/orchestration/agent-deliverable-quality";
import {
  hasCompleteSentenceEnding,
  isIncompleteSpecLine,
} from "@/ai/orchestration/agent-output-completion";

describe("agent output completion helpers", () => {
  it("rejects incomplete spec lines ending with a colon", () => {
    assert.equal(isIncompleteSpecLine("- Method and path:"), true);
    assert.equal(hasCompleteSentenceEnding("## APIs\n\n- Method and path:"), false);
  });

  it("accepts lines ending with sentence punctuation", () => {
    assert.equal(
      hasCompleteSentenceEnding("## Risks\n\nWe retry with exponential backoff."),
      true,
    );
  });
});

describe("isBackendDeliverableInsufficient", () => {
  it("requires four endpoint blocks and a complete final sentence", () => {
    const incomplete = [
      "## Stack & Layout",
      "Monolith layout.",
      "## Data & APIs",
      "**Endpoint 1:** Create",
      "**Endpoint 2:** Complete",
      "**Endpoint 3:** Upload",
      "- Method and path:",
      "## Backend Risks",
      "Pool exhaustion under burst load.",
    ].join("\n\n");

    assert.equal(isBackendDeliverableInsufficient(incomplete), true);

    const complete = [
      "## Stack & Layout",
      "Monolith layout.",
      "## Data & APIs",
      "**Endpoint 1:** Create onboarding.",
      "**Endpoint 2:** Complete task.",
      "**Endpoint 3:** Upload document.",
      "**Endpoint 4:** List active onboardings.",
      "## Backend Risks",
      "Pool exhaustion under burst load with mitigations.",
    ].join("\n\n");

    assert.equal(isBackendDeliverableInsufficient(complete), false);
  });
});

describe("isSoftwareArchitectDeliverableInsufficient", () => {
  it("flags outputs ending with a short word fragment", () => {
    const text = [
      "## Architecture",
      "Monolith.",
      "## Data Model",
      "Entities.",
      "## APIs & Integration",
      "REST.",
      "## Decisions & Risks",
      "Trade-offs.",
      "x".repeat(820),
      "handler re",
    ].join("\n\n");

    assert.equal(isSoftwareArchitectDeliverableInsufficient(text), true);
  });
});
