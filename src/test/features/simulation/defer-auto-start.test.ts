import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  scheduleDeferredCallback,
  type DeferredCallbackScheduler,
} from "@/features/simulation/defer-auto-start";

function manualScheduler(): {
  readonly scheduler: DeferredCallbackScheduler;
  flush: () => void;
} {
  let pending: (() => void) | null = null;
  return {
    scheduler: {
      schedule: (callback) => {
        pending = callback;
        return "handle";
      },
      cancel: () => {
        pending = null;
      },
    },
    flush: () => {
      pending?.();
    },
  };
}

describe("scheduleDeferredCallback", () => {
  it("does not invoke the callback after cleanup (StrictMode remount)", () => {
    const { scheduler, flush } = manualScheduler();
    let started = 0;

    const cancel = scheduleDeferredCallback(() => {
      started += 1;
    }, scheduler);
    cancel();
    flush();

    assert.equal(started, 0);
  });

  it("invokes the callback once when the deferral is allowed to fire", () => {
    const { scheduler, flush } = manualScheduler();
    let started = 0;

    scheduleDeferredCallback(() => {
      started += 1;
    }, scheduler);
    flush();

    assert.equal(started, 1);
  });
});
