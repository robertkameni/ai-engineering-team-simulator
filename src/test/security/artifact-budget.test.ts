import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSimulationRoster } from "../../ai/agents/roster.js";
import { generateRunArtifacts } from "../../ai/artifacts/generate-run-artifacts.js";
import {
  assertSimulationWithinBudget,
  getSimulationMaxCostUsd,
  isSimulationBudgetExceeded,
} from "../../ai/orchestration/simulation-budget.js";
import { RunUsageAccumulator } from "../../lib/ai/run-usage-accumulator.js";

function buildAtBudgetAccumulator(): RunUsageAccumulator {
  const maxCostUsd = getSimulationMaxCostUsd();
  const accumulator = new RunUsageAccumulator();
  accumulator.addDelta({
    promptTokens: 50_000,
    completionTokens: 25_000,
    totalTokens: 75_000,
    estimatedCostUsd: maxCostUsd,
  });
  return accumulator;
}

describe("generateRunArtifacts budget enforcement", () => {
  it("throws before artifact LLM calls when accumulator is at the cost ceiling", async () => {
    const roster = createSimulationRoster("software");
    const accumulator = buildAtBudgetAccumulator();
    let artifactCompleteCalls = 0;

    await assert.rejects(
      () =>
        generateRunArtifacts({
          productIdea: "Build a task tracker",
          transcript: [
            {
              role: "pm",
              agentName: roster.pm.name,
              content: "Scope v1 for task management.",
            },
          ],
          roster,
          usageAccumulator: accumulator,
          onArtifactComplete: async () => {
            artifactCompleteCalls += 1;
          },
        }),
      (error: unknown) => {
        assert.ok(isSimulationBudgetExceeded(error));
        return true;
      },
    );

    assert.equal(artifactCompleteCalls, 0);
  });

  it("entry assertSimulationWithinBudget blocks at ceiling without generateRunArtifacts", () => {
    const accumulator = buildAtBudgetAccumulator();
    assert.throws(() => assertSimulationWithinBudget(accumulator), (error: unknown) =>
      isSimulationBudgetExceeded(error),
    );
  });
});
