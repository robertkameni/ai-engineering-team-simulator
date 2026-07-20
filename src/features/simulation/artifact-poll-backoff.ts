/** Initial wait before the first retry after a pending artifacts fetch. */
export const POLL_ARTIFACT_INITIAL_MS = 2_500;

/** Cap for exponential backoff between artifact polls. */
export const POLL_ARTIFACT_MAX_INTERVAL_MS = 10_000;

/** Growth factor applied after each wait. */
export const POLL_ARTIFACT_BACKOFF_FACTOR = 1.5;

/** Match artifacts route synthesis budget (approx). */
export const POLL_ARTIFACT_MAX_MS = 320_000;

/**
 * Interval to wait after poll `pollIndex` (0-based) before the next fetch.
 * Sequence: 2500 → 3750 → 5625 → 8437 → 10000 (capped).
 */
export function computeArtifactPollIntervalMs(pollIndex: number): number {
  const raw =
    POLL_ARTIFACT_INITIAL_MS *
    POLL_ARTIFACT_BACKOFF_FACTOR ** Math.max(0, pollIndex);
  return Math.min(POLL_ARTIFACT_MAX_INTERVAL_MS, Math.floor(raw));
}

/**
 * How many wait intervals fit inside `windowMs` before the cumulative wait
 * meets or exceeds the window. Used to validate poll-storm budgets.
 */
export function countArtifactPollIntervalsWithinMs(windowMs: number): number {
  if (windowMs <= 0) {
    return 0;
  }

  let elapsed = 0;
  let intervals = 0;
  while (elapsed < windowMs) {
    elapsed += computeArtifactPollIntervalMs(intervals);
    intervals += 1;
  }
  return intervals;
}
