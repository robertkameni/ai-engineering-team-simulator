"use client";

import Link from "next/link";
import { Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useWorkspaceRun,
  workspaceRunCanRerun,
} from "@/features/workspace/workspace-run-context";
import {
  hasWorkspacePrompt,
  workspaceUrlForRerun,
} from "@/lib/workspace-url";

interface SidebarSimulationActionProps {
  rerunPrompt?: string | null;
  onNavigate?: () => void;
}

export function SidebarSimulationAction({
  rerunPrompt,
  onNavigate,
}: SidebarSimulationActionProps) {
  const liveSession = useWorkspaceRun();
  const staticPrompt = hasWorkspacePrompt(rerunPrompt) ? rerunPrompt!.trim() : null;

  if (liveSession) {
    const canRerun = workspaceRunCanRerun(liveSession);

    if (canRerun) {
      return (
        <Button
          className="w-full justify-start gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
          asChild
        >
          <Link
            href={workspaceUrlForRerun(liveSession.currentPrompt)}
            onClick={onNavigate}
          >
            <RotateCw />
            Rerun simulation
          </Link>
        </Button>
      );
    }

    return (
      <Button
        type="button"
        className="w-full justify-start gap-2"
        disabled
        title="Simulation in progress"
      >
        <RotateCw className="opacity-60" />
        Simulation running…
      </Button>
    );
  }

  if (staticPrompt) {
    return (
      <Button
        className="w-full justify-start gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
        asChild
      >
        <Link
          href={workspaceUrlForRerun(staticPrompt)}
          onClick={onNavigate}
        >
          <RotateCw />
          Rerun simulation
        </Link>
      </Button>
    );
  }

  return (
    <Button
      className="w-full justify-start gap-2 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]"
      asChild
    >
      <Link href="/workspace" onClick={onNavigate}>
        <Plus />
        New simulation
      </Link>
    </Button>
  );
}
