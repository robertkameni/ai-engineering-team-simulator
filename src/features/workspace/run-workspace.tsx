"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import type { MockRun } from "@/features/agents/types";
import type { RunArtifacts } from "@/features/artifacts/types";
import { WorkspaceView } from "@/features/workspace/workspace-view";

interface RunWorkspaceProps {
  run: MockRun;
}

export function RunWorkspace({ run: initialRun }: RunWorkspaceProps) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [isRegeneratingArtifacts, setIsRegeneratingArtifacts] = useState(false);

  const canRegenerateArtifacts =
    run.messages.length > 0 &&
    (run.status === "complete" || run.status === "failed");

  const regenerateArtifacts = useCallback(async () => {
    if (!canRegenerateArtifacts || isRegeneratingArtifacts) return;

    setIsRegeneratingArtifacts(true);
    setRun((current) => ({ ...current, artifactsStatus: "generating" }));

    try {
      const response = await fetch(`/api/runs/${run.id}/artifacts`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        artifacts?: RunArtifacts;
        status?: MockRun["artifactsStatus"];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to regenerate artifacts");
      }

      setRun((current) => ({
        ...current,
        artifacts: data.artifacts ?? null,
        artifactsStatus: data.status ?? "ready",
      }));
      router.refresh();
    } catch (error) {
      console.error(error);
      setRun((current) => ({
        ...current,
        artifactsStatus: "unavailable",
      }));
    } finally {
      setIsRegeneratingArtifacts(false);
    }
  }, [canRegenerateArtifacts, isRegeneratingArtifacts, run.id, router]);

  return (
    <WorkspaceView
      run={run}
      onSimulate={(prompt) => {
        router.push(`/workspace?prompt=${encodeURIComponent(prompt)}`);
      }}
      onRegenerateArtifacts={regenerateArtifacts}
      canRegenerateArtifacts={canRegenerateArtifacts}
      isRegeneratingArtifacts={isRegeneratingArtifacts}
    />
  );
}
