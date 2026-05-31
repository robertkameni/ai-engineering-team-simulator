import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";

const DEFAULT_SIMULATION_MAX_COST_USD = 0.75;

export class SimulationBudgetExceededError extends Error {
  override readonly name = "SimulationBudgetExceededError";

  readonly estimatedCostUsd: number;
  readonly maxCostUsd: number;

  constructor(estimatedCostUsd: number, maxCostUsd: number) {
    super(
      `Simulation cost budget exceeded (${estimatedCostUsd.toFixed(4)} USD >= ${maxCostUsd} USD limit)`,
    );
    this.estimatedCostUsd = estimatedCostUsd;
    this.maxCostUsd = maxCostUsd;
  }
}

export function isSimulationBudgetExceeded(
  error: unknown,
): error is SimulationBudgetExceededError {
  return error instanceof SimulationBudgetExceededError;
}

export function getSimulationMaxCostUsd(): number {
  const raw = process.env.SIMULATION_MAX_COST_USD?.trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SIMULATION_MAX_COST_USD;
}

export function assertSimulationWithinBudget(
  accumulator: RunUsageAccumulator,
): void {
  const { estimatedCostUsd } = accumulator.getTotals();
  const maxCostUsd = getSimulationMaxCostUsd();
  if (estimatedCostUsd >= maxCostUsd) {
    throw new SimulationBudgetExceededError(estimatedCostUsd, maxCostUsd);
  }
}
