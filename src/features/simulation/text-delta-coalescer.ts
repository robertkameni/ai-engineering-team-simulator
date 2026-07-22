/**
 * Coalesces rapid SSE text-delta chunks onto one rAF tick before React state.
 * Prior review F1: avoid remapping the full messages array on every token.
 */

export type TextDeltaCoalescerOptions = {
  readonly appendDelta: (messageId: string, delta: string) => void;
  readonly requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
};

export type TextDeltaCoalescer = {
  enqueue: (messageId: string, delta: string) => void;
  flush: () => void;
  dispose: () => void;
};

export function createTextDeltaCoalescer(
  options: TextDeltaCoalescerOptions,
): TextDeltaCoalescer {
  const schedule =
    options.requestAnimationFrame ??
    ((callback: FrameRequestCallback) =>
      globalThis.requestAnimationFrame(callback));
  const cancel =
    options.cancelAnimationFrame ??
    ((handle: number) => globalThis.cancelAnimationFrame(handle));

  let pendingMessageId: string | null = null;
  let pendingDelta = "";
  let frameHandle: number | null = null;
  let isDisposed = false;

  const clearScheduledFrame = () => {
    if (frameHandle == null) {
      return;
    }
    cancel(frameHandle);
    frameHandle = null;
  };

  const flushPending = () => {
    if (pendingMessageId == null || pendingDelta.length === 0) {
      pendingMessageId = null;
      pendingDelta = "";
      return;
    }

    const messageId = pendingMessageId;
    const delta = pendingDelta;
    pendingMessageId = null;
    pendingDelta = "";
    options.appendDelta(messageId, delta);
  };

  const scheduleFlush = () => {
    if (frameHandle != null || isDisposed) {
      return;
    }
    frameHandle = schedule(() => {
      frameHandle = null;
      if (isDisposed) {
        pendingMessageId = null;
        pendingDelta = "";
        return;
      }
      flushPending();
    });
  };

  return {
    enqueue(messageId, delta) {
      if (isDisposed || delta.length === 0) {
        return;
      }

      if (pendingMessageId != null && pendingMessageId !== messageId) {
        clearScheduledFrame();
        flushPending();
      }

      pendingMessageId = messageId;
      pendingDelta += delta;
      scheduleFlush();
    },

    flush() {
      clearScheduledFrame();
      flushPending();
    },

    dispose() {
      isDisposed = true;
      clearScheduledFrame();
      pendingMessageId = null;
      pendingDelta = "";
    },
  };
}
