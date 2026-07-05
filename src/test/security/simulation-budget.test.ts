import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertSimulationWithinBudget,
  getSimulationMaxCostUsd,
  isSimulationBudgetExceeded,
  SimulationBudgetExceededError,
} from "../../ai/orchestration/simulation-budget.js";
import { RunUsageAccumulator } from "../../lib/ai/run-usage-accumulator.js";

describe("getSimulationMaxCostUsd", () => {
  it("returns the default ceiling when env is unset", () => {
    const previous = process.env.SIMULATION_MAX_COST_USD;
    delete process.env.SIMULATION_MAX_COST_USD;
    try {
      assert.equal(getSimulationMaxCostUsd(), 0.75);
    } finally {
      if (previous !== undefined) {
        process.env.SIMULATION_MAX_COST_USD = previous;
      }
    }
  });
});

describe("assertSimulationWithinBudget", () => {
  it("does not throw when cost is below the ceiling", () => {
    const maxCostUsd = getSimulationMaxCostUsd();
    const accumulator = new RunUsageAccumulator();
    accumulator.addDelta({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: maxCostUsd - 0.001,
    });

    assert.doesNotThrow(() => assertSimulationWithinBudget(accumulator));
  });

  it("throws SimulationBudgetExceededError when cost reaches the ceiling", () => {
    const maxCostUsd = getSimulationMaxCostUsd();
    const accumulator = new RunUsageAccumulator();
    accumulator.addDelta({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: maxCostUsd,
    });

    assert.throws(
      () => assertSimulationWithinBudget(accumulator),
      (error: unknown) => {
        assert.ok(isSimulationBudgetExceeded(error));
        assert.ok(error instanceof SimulationBudgetExceededError);
        assert.equal(error.estimatedCostUsd, maxCostUsd);
        assert.equal(error.maxCostUsd, maxCostUsd);
        return true;
      },
    );
  });
});
