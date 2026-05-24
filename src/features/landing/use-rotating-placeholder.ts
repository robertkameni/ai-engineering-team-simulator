"use client";

import { useEffect, useState } from "react";

import { LANDING_PLACEHOLDER_IDEAS } from "@/features/landing/landing-content";

export function useRotatingPlaceholder(intervalMs = 4_200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = globalThis.setInterval(() => {
      setIndex((current) => (current + 1) % LANDING_PLACEHOLDER_IDEAS.length);
    }, intervalMs);
    return () => globalThis.clearInterval(timer);
  }, [intervalMs]);

  return LANDING_PLACEHOLDER_IDEAS[index]!;
}
