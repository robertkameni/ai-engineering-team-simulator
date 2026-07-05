class SimulationAbortedError extends Error {
  override readonly name = "SimulationAbortedError";

  constructor(message = "Simulation cancelled") {
    super(message);
  }
}

export function isSimulationAborted(error: unknown): boolean {
  if (error instanceof SimulationAbortedError) {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SimulationAbortedError();
  }
}
