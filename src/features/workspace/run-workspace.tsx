"use client";

import { useRouter } from "next/navigation";

import { WorkspaceView } from "@/features/workspace/workspace-view";
import type { MockRun } from "@/features/agents/types";

interface RunWorkspaceProps {
  run: MockRun;
}

export function RunWorkspace({ run }: RunWorkspaceProps) {
  const router = useRouter();

  return (
    <WorkspaceView
      run={run}
      onSimulate={(prompt) => {
        router.push(`/workspace?prompt=${encodeURIComponent(prompt)}`);
      }}
    />
  );
}
