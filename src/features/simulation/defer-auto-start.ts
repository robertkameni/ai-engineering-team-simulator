/**
 * React StrictMode remounts effects in development: the first mount's cleanup
 * runs synchronously before the remount. Starting a fetch in the effect body
 * therefore always produces a canceled /api/simulate in the network tab.
 * Deferring the start until after the current turn lets cleanup cancel the
 * timer instead of an in-flight request.
 */

export interface DeferredCallbackScheduler {
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
}

const STRICT_MODE_DEFER_MS = 0;

const defaultScheduler: DeferredCallbackScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function scheduleDeferredCallback(
  callback: () => void,
  scheduler: DeferredCallbackScheduler = defaultScheduler,
): () => void {
  const handle = scheduler.schedule(callback, STRICT_MODE_DEFER_MS);
  return () => {
    scheduler.cancel(handle);
  };
}
