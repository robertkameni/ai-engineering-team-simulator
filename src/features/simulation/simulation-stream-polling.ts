import type { ArtifactsPanelStatus, PartialRunArtifacts } from "@/features/artifacts/types";
import type { DebateExitOutcome, RunStatus, SimulationMessage } from "@/features/agents/types";
import type { TeamRosterPreview } from "@/features/simulation/team-roster-preview";

const POLL_ARTIFACT_INTERVAL_MS = 800;
/** Match artifacts route synthesis budget (approx). */
const POLL_ARTIFACT_MAX_MS = 320_000;
const POLL_RUN_PROGRESS_INTERVAL_MS = 2_000;
/** Railway SSE cap is 15 minutes; allow polling slightly longer. */
const POLL_RUN_PROGRESS_MAX_MS = 16 * 60 * 1000;

type RunProgressResponse = {
  id: string;
  status: RunStatus;
  messages: SimulationMessage[];
  artifacts: PartialRunArtifacts | null;
  artifactsStatus: ArtifactsPanelStatus;
  debateOutcome: DebateExitOutcome | null;
  teamRoster: TeamRosterPreview | null;
};

type ArtifactsFetchResult =
  | {
      ok: true;
      artifacts: PartialRunArtifacts | null;
      status: ArtifactsPanelStatus;
      debateOutcome: DebateExitOutcome | null;
    }
  | { ok: false; retryable: boolean };

function isRetryableArtifactsHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchRunProgress(
  runId: string,
  signal?: AbortSignal,
): Promise<RunProgressResponse | null> {
  try {
    const response = await fetch(`/api/runs/${runId}`, { signal });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RunProgressResponse;
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
  };

  return {
    ok: true,
    artifacts: data.artifacts,
    status: data.status,
    debateOutcome: data.debateOutcome ?? null,
  };
}

function waitForArtifactPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, POLL_ARTIFACT_INTERVAL_MS);
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
};

export async function pollArtifactsUntilSettled(
  id: string,
  setters: ArtifactPollSetters,
  signal?: AbortSignal,
): Promise<ArtifactsPanelStatus | null> {
  const isActive = () => signal == null || !signal.aborted;

  const deadline = Date.now() + POLL_ARTIFACT_MAX_MS;
  while (Date.now() < deadline) {
    if (!isActive()) return null;

    const result = await fetchArtifactsState(id, signal);

    if (!isActive()) return null;

    if (!result.ok) {
      if (result.retryable) {
        try {
          await waitForArtifactPoll(signal);
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
      setters.setArtifacts(result.artifacts);
      setters.setArtifactsStatus(result.status);
      setters.setDebateOutcome(result.debateOutcome);
    }

    if (result.status === "ready" || result.status === "unavailable") {
      return result.status;
    }

    try {
      await waitForArtifactPoll(signal);
    } catch {
      return null;
    }
  }

  if (!isActive()) return null;

  const finalResult = await fetchArtifactsState(id, signal);
  if (!isActive()) return null;

  if (finalResult.ok) {
    setters.setArtifacts(finalResult.artifacts);
    setters.setArtifactsStatus(finalResult.status);
    setters.setDebateOutcome(finalResult.debateOutcome);
    return finalResult.status;
  }

  setters.setArtifactsStatus("unavailable");
  return "unavailable";
}

export type RunProgressRecoverySetters = ArtifactPollSetters & {
  setStatus: (status: RunStatus) => void;
  setError: (error: string | null) => void;
  setActiveAgent: (role: null) => void;
  setRunId: (runId: string) => void;
  setMessages: (messages: SimulationMessage[]) => void;
  setTeamRoster: (roster: TeamRosterPreview | null) => void;
};

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

    const progress = await fetchRunProgress(id, signal);
    if (!isActive()) {
      return;
    }

    if (progress) {
      setters.setRunId(progress.id);
      setters.setMessages(progress.messages);
      if (progress.teamRoster) {
        setters.setTeamRoster(progress.teamRoster);
      }
      setters.setArtifacts(progress.artifacts);
      setters.setArtifactsStatus(progress.artifactsStatus);
      setters.setDebateOutcome(progress.debateOutcome);

      if (progress.status === "complete") {
        setters.setStatus("complete");
        setters.setError(
          progress.artifactsStatus === "unavailable"
            ? "Artifact synthesis failed"
            : null,
        );
        onComplete(id);
        return;
      }

      if (progress.status === "failed") {
        setters.setStatus("failed");
        setters.setError("Simulation failed");
        return;
      }
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
