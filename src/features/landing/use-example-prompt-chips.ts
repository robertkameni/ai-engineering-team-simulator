"use client";

import { useEffect, useState } from "react";

import {
  getDefaultExamplePrompts,
  pickRandomExamplePrompts,
} from "@/features/landing/example-prompts";

const CHIP_COUNT = 3;
const ROTATE_INTERVAL_MS = 10_000;

export function useExamplePromptChips(
  count = CHIP_COUNT,
  rotateIntervalMs = ROTATE_INTERVAL_MS,
) {
  const [prompts, setPrompts] = useState<string[]>(() =>
    getDefaultExamplePrompts(count),
  );

  useEffect(() => {
    setPrompts(getDefaultExamplePrompts(count));
    const pick = () => setPrompts(pickRandomExamplePrompts(count));
    queueMicrotask(pick);

    if (rotateIntervalMs <= 0) {
      return;
    }

    const rotateTimer = globalThis.setInterval(pick, rotateIntervalMs);

    return () => {
      globalThis.clearInterval(rotateTimer);
    };
  }, [count, rotateIntervalMs]);

  return prompts;
}
