import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type { DebateExitOutcome, RunStatus, SimulationMessage } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";
import {
  computeArtifactPollIntervalMs,
  POLL_ARTIFACT_MAX_MS,
} from "@/features/simulation/artifact-poll-backoff";

const POLL_RUN_PROGRESS_INTERVAL_MS = 2_000;
/** Railway SSE cap is 15 minutes; allow polling slightly longer. */
const POLL_RUN_PROGRESS_MAX_MS = 16 * 60 * 1000;

/** Slim progress payload from GET /api/runs/[id]/progress (arch-review F2). */
export type RunProgressSnapshot = {
  status: RunStatus;
  messageCount: number;
  lastMessageText: string;
  artifactsComplete: boolean;
};

type RunFullSnapshot = {
  id: string;
  status: RunStatus;
  messages: SimulationMessage[];
  artifacts: PartialRunArtifacts | null;
  artifactsStatus: ArtifactsPanelStatus;
  debateOutcome: DebateExitOutcome | null;
  teamRoster: TeamRosterPreview | null;
  stackValidationFailed?: boolean;
  crossValidationFailed?: boolean;
};

type ArtifactsFetchResult =
  | {
      ok: true;
      artifacts: PartialRunArtifacts | null;
      status: ArtifactsPanelStatus;
      debateOutcome: DebateExitOutcome | null;
      stackValidationFailed: boolean;
      crossValidationFailed: boolean;
    }
  | { ok: false; retryable: boolean };

export function isRunProgressTerminal(status: RunStatus): boolean {
  return status === "complete" || status === "failed";
}

function isRetryableArtifactsHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchSlimRunProgress(
  runId: string,
  signal?: AbortSignal,
): Promise<RunProgressSnapshot | null> {
  try {
    const response = await fetch(`/api/runs/${runId}/progress`, { signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RunProgressSnapshot;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    return null;
  }
}

async function fetchFullRunSnapshot(
  runId: string,
  signal?: AbortSignal,
): Promise<RunFullSnapshot | null> {
  try {
    const response = await fetch(`/api/runs/${runId}`, { signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RunFullSnapshot;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }
    return null;
  }
}

function waitForRunProgressPoll(
  signal?: AbortSignal,
  intervalMs = POLL_RUN_PROGRESS_INTERVAL_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, intervalMs);
    if (!signal) {
      return;
    }
    if (signal.aborted) {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function fetchArtifactsState(
  id: string,
  signal?: AbortSignal,
): Promise<ArtifactsFetchResult> {
  let response: Response;
  try {
    response = await fetch(`/api/runs/${id}/artifacts`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, retryable: false };
    }
    return { ok: false, retryable: true };
  }

  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableArtifactsHttpStatus(response.status),
    };
  }

  const data = (await response.json()) as {
    artifacts: PartialRunArtifacts | null;
    status: ArtifactsPanelStatus;
    debateOutcome?: DebateExitOutcome | null;
    stackValidationFailed?: boolean;
    crossValidationFailed?: boolean;
  };

  return {
    ok: true,
    artifacts: data.artifacts,
    status: data.status,
    debateOutcome: data.debateOutcome ?? null,
    stackValidationFailed: data.stackValidationFailed === true,
    crossValidationFailed: data.crossValidationFailed === true,
  };
}

function waitForArtifactPoll(
  intervalMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, intervalMs);
    if (signal) {
      if (signal.aborted) {
        globalThis.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          globalThis.clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true },
      );
    }
  });
}

export type ArtifactPollSetters = {
  setArtifacts: (artifacts: PartialRunArtifacts | null) => void;
  setArtifactsStatus: (status: ArtifactsPanelStatus) => void;
  setDebateOutcome: (outcome: DebateExitOutcome | null) => void;
  setStackValidationFailed: (failed: boolean) => void;
  setCrossValidationFailed: (failed: boolean) => void;
};

function applyArtifactsFetchResult(
  setters: ArtifactPollSetters,
  result: Extract<ArtifactsFetchResult, { ok: true }>,
): void {
  setters.setArtifacts(result.artifacts);
  setters.setArtifactsStatus(result.status);
  setters.setDebateOutcome(result.debateOutcome);
  setters.setStackValidationFailed(result.stackValidationFailed);
  setters.setCrossValidationFailed(result.crossValidationFailed);
}

/**
 * Fallback poller when SSE did not deliver `all_artifacts_complete`.
 * Uses exponential backoff (2.5s → ×1.5 → cap 10s) instead of a fixed 800ms storm.
 */
export async function pollArtifactsUntilSettled(
  id: string,
  setters: ArtifactPollSetters,
  signal?: AbortSignal,
): Promise<ArtifactsPanelStatus | null> {
  const isActive = () => signal == null || !signal.aborted;

  const deadline = Date.now() + POLL_ARTIFACT_MAX_MS;
  let waitIndex = 0;

  while (Date.now() < deadline) {
    if (!isActive()) return null;

    const result = await fetchArtifactsState(id, signal);

    if (!isActive()) return null;

    if (!result.ok) {
      if (result.retryable) {
        try {
          await waitForArtifactPoll(
            computeArtifactPollIntervalMs(waitIndex),
            signal,
          );
          waitIndex += 1;
        } catch {
          return null;
        }
        continue;
      }
      if (isActive()) {
        setters.setArtifactsStatus("unavailable");
      }
      return "unavailable";
    }

    if (isActive()) {
      applyArtifactsFetchResult(setters, result);
    }

    if (result.status === "ready" || result.status === "unavailable") {
      return result.status;
    }

    try {
      await waitForArtifactPoll(
        computeArtifactPollIntervalMs(waitIndex),
        signal,
      );
      waitIndex += 1;
    } catch {
      return null;
    }
  }

  if (!isActive()) return null;

  const finalResult = await fetchArtifactsState(id, signal);
  if (!isActive()) return null;

  if (finalResult.ok) {
    applyArtifactsFetchResult(setters, finalResult);
    return finalResult.status;
  }

  setters.setArtifactsStatus("unavailable");
  return "unavailable";
}

/** Single fetch used when SSE already signaled artifact completion. */
export async function fetchArtifactsOnce(
  id: string,
  setters: ArtifactPollSetters,
  signal?: AbortSignal,
): Promise<ArtifactsPanelStatus | null> {
  if (signal?.aborted) {
    return null;
  }

  const result = await fetchArtifactsState(id, signal);
  if (signal?.aborted) {
    return null;
  }

  if (!result.ok) {
    setters.setArtifactsStatus("unavailable");
    return "unavailable";
  }

  applyArtifactsFetchResult(setters, result);
  return result.status;
}

export type RunProgressRecoverySetters = ArtifactPollSetters & {
  setStatus: (status: RunStatus) => void;
  setError: (error: string | null) => void;
  setActiveAgent: (role: null) => void;
  setRunId: (runId: string) => void;
  setMessages: (messages: SimulationMessage[]) => void;
  setTeamRoster: (roster: TeamRosterPreview | null) => void;
};

function applyFullRunSnapshot(
  setters: RunProgressRecoverySetters,
  snapshot: RunFullSnapshot,
): void {
  setters.setRunId(snapshot.id);
  setters.setMessages(snapshot.messages);
  if (snapshot.teamRoster) {
    setters.setTeamRoster(snapshot.teamRoster);
  }
  setters.setArtifacts(snapshot.artifacts);
  setters.setArtifactsStatus(snapshot.artifactsStatus);
  setters.setDebateOutcome(snapshot.debateOutcome);
  setters.setStackValidationFailed(snapshot.stackValidationFailed === true);
  setters.setCrossValidationFailed(snapshot.crossValidationFailed === true);
}

/**
 * After SSE drop: poll slim /progress, then one full GET /api/runs/[id]
 * when status is terminal (complete | failed). Arch-review F2.
 */
export async function recoverRunAfterStreamDrop(
  id: string,
  setters: RunProgressRecoverySetters,
  onComplete: (runId: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const isActive = () => signal == null || !signal.aborted;

  setters.setStatus("running");
  setters.setError(null);
  setters.setActiveAgent(null);

  const deadline = Date.now() + POLL_RUN_PROGRESS_MAX_MS;
  while (Date.now() < deadline) {
    if (!isActive()) {
      return;
    }

    const progress = await fetchSlimRunProgress(id, signal);
    if (!isActive()) {
      return;
    }

    if (progress && isRunProgressTerminal(progress.status)) {
      const snapshot = await fetchFullRunSnapshot(id, signal);
      if (!isActive()) {
        return;
      }

      if (!snapshot) {
        setters.setStatus("failed");
        setters.setError("Simulation failed");
        return;
      }

      applyFullRunSnapshot(setters, snapshot);

      if (snapshot.status === "complete") {
        setters.setStatus("complete");
        setters.setError(
          snapshot.artifactsStatus === "unavailable"
            ? "Artifact synthesis failed"
            : null,
        );
        onComplete(id);
        return;
      }

      setters.setStatus("failed");
      setters.setError("Simulation failed");
      return;
    }

    try {
      await waitForRunProgressPoll(signal);
    } catch {
      return;
    }
  }

  if (!isActive()) {
    return;
  }

  setters.setStatus("failed");
  setters.setError(
    "Connection lost and the simulation did not finish in time. Check your run history — it may still complete in the background.",
  );
}

export function formatSimulationStreamError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Simulation failed";
  }

  const message = error.message.trim();
  const normalized = message.toLowerCase();

  if (
    normalized === "network error" ||
    normalized === "failed to fetch" ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed")
  ) {
    return "Connection lost during the simulation. The server may still be processing — check your run history and retry if the run did not complete.";
  }

  return message || "Simulation failed";
}
