"use client";

import { useEffect, useMemo, useState } from "react";

import { SidebarRunItem } from "@/features/workspace/sidebar-run-item";
import type { SidebarRunItemData } from "@/features/workspace/sidebar-types";

interface SidebarRecentRunsProps {
  pathname: string;
  onNavigate?: () => void;
  initialRuns?: SidebarRunItemData[];
}

export function SidebarRecentRuns({
  pathname,
  onNavigate,
  initialRuns,
}: SidebarRecentRunsProps) {
  const [fetchedRuns, setFetchedRuns] = useState<SidebarRunItemData[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(initialRuns == null);
  const [deletedIds, setDeletedIds] = useState(() => new Set<string>());

  useEffect(() => {
    if (initialRuns != null) return;

    let cancelled = false;

    async function fetchRuns() {
      setIsLoading(true);
      try {
        const response = await fetch("/api/runs");
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { runs: SidebarRunItemData[] };
        setFetchedRuns(data.runs);
      } catch {
        // Keep empty list on failure
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchRuns();

    return () => {
      cancelled = true;
    };
  }, [pathname, initialRuns]);

  const runs = useMemo(() => {
    const source = initialRuns ?? fetchedRuns ?? [];
    return source.filter((run) => !deletedIds.has(run.id));
  }, [initialRuns, fetchedRuns, deletedIds]);

  function handleDeleted(runId: string) {
    setDeletedIds((current) => new Set(current).add(runId));
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
    );
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
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}
