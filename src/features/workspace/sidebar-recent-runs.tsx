"use client";

import { useEffect, useState } from "react";

import {
  SidebarRunItem,
  type SidebarRunItemData,
} from "@/features/workspace/sidebar-run-item";

interface SidebarRecentRunsProps {
  pathname: string;
}

export function SidebarRecentRuns({ pathname }: SidebarRecentRunsProps) {
  const [runs, setRuns] = useState<SidebarRunItemData[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRuns() {
      try {
        const response = await fetch("/api/runs");
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { runs: SidebarRunItemData[] };
        setRuns(data.runs);
      } catch {
        // Keep empty list on failure
      }
    }

    void fetchRuns();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function handleDeleted(runId: string) {
    setRuns((current) => current.filter((run) => run.id !== runId));
  }

  if (runs.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No runs yet. Start a simulation.
      </p>
    );
  }

  return (
    <>
      {runs.map((run) => (
        <SidebarRunItem
          key={run.id}
          run={run}
          isActive={pathname === `/runs/${run.id}`}
          onDeleted={handleDeleted}
        />
      ))}
    </>
  );
}
