import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { createTextDeltaCoalescer } from "@/features/simulation/text-delta-coalescer";

describe("createTextDeltaCoalescer", () => {
  it("coalesces multiple deltas into one flush via requestAnimationFrame", async () => {
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = mock.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const cancelAnimationFrame = mock.fn(() => undefined);
    const appendDelta = mock.fn((_messageId: string, _delta: string) => undefined);

    const coalescer = createTextDeltaCoalescer({
      requestAnimationFrame,
      cancelAnimationFrame,
      appendDelta,
    });

    coalescer.enqueue("msg-1", "Hello");
    coalescer.enqueue("msg-1", " ");
    coalescer.enqueue("msg-1", "world");

    assert.equal(appendDelta.mock.callCount(), 0);
    assert.equal(requestAnimationFrame.mock.callCount(), 1);
    assert.equal(frames.length, 1);

    frames[0]?.(0);

    assert.equal(appendDelta.mock.callCount(), 1);
    assert.deepEqual(appendDelta.mock.calls[0]?.arguments, [
      "msg-1",
      "Hello world",
    ]);
  });

  it("flushes immediately and cancels the pending frame", () => {
    const frames: FrameRequestCallback[] = [];
    const requestAnimationFrame = mock.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      return 42;
    });
    const cancelAnimationFrame = mock.fn(() => undefined);
    const appendDelta = mock.fn((_messageId: string, _delta: string) => undefined);

    const coalescer = createTextDeltaCoalescer({
      requestAnimationFrame,
      cancelAnimationFrame,
      appendDelta,
    });

    coalescer.enqueue("msg-1", "partial");
    coalescer.flush();

    assert.equal(cancelAnimationFrame.mock.callCount(), 1);
    assert.deepEqual(cancelAnimationFrame.mock.calls[0]?.arguments, [42]);
    assert.equal(appendDelta.mock.callCount(), 1);
    assert.deepEqual(appendDelta.mock.calls[0]?.arguments, ["msg-1", "partial"]);

    frames[0]?.(0);
    assert.equal(appendDelta.mock.callCount(), 1);
  });

  it("ignores enqueue after dispose and cancels pending work", () => {
    const requestAnimationFrame = mock.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 7;
    });
    const cancelAnimationFrame = mock.fn(() => undefined);
    const appendDelta = mock.fn((_messageId: string, _delta: string) => undefined);

    const coalescer = createTextDeltaCoalescer({
      requestAnimationFrame,
      cancelAnimationFrame,
      appendDelta,
    });

    coalescer.enqueue("msg-1", "a");
    coalescer.dispose();
    coalescer.enqueue("msg-1", "b");

    assert.equal(appendDelta.mock.callCount(), 1);
    assert.deepEqual(appendDelta.mock.calls[0]?.arguments, ["msg-1", "a"]);
  });
});
