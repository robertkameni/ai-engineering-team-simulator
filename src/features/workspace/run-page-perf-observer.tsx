"use client";

import { useEffect } from "react";

/**
 * Data-gathering only: logs LCP/FCP for /runs/[id] to the console.
 * No analytics endpoint. Reactivate F5 follow-up (b) from production LCP signal.
 */
export function RunPagePerfObserver() {
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") {
      return;
    }

    const observers: PerformanceObserver[] = [];

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.info(
            "[perf] /runs/[id] LCP:",
            Math.round(entry.startTime),
            "ms",
          );
        }
      });
      lcpObserver.observe({
        type: "largest-contentful-paint",
        buffered: true,
      });
      observers.push(lcpObserver);
    } catch {
      // Entry type unsupported in this browser.
    }

    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== "first-contentful-paint") {
            continue;
          }
          console.info(
            "[perf] /runs/[id] FCP:",
            Math.round(entry.startTime),
            "ms",
          );
        }
      });
      paintObserver.observe({ type: "paint", buffered: true });
      observers.push(paintObserver);
    } catch {
      // Entry type unsupported in this browser.
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, []);

  return null;
}
