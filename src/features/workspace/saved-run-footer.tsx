import Link from "next/link";
import { Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { OpenInForgeButton } from "@/features/workspace/open-in-forge-button";
import {
  hasWorkspacePrompt,
  workspaceUrlForRerun,
} from "@/lib/workspace-url";

interface SavedRunFooterProps {
  userPrompt?: string;
  runId: string;
  isAuthenticated?: boolean;
}

export function SavedRunFooter({
  userPrompt,
  runId,
  isAuthenticated = false,
}: SavedRunFooterProps) {
  const canRerun = hasWorkspacePrompt(userPrompt);

  return (
    <footer className="@container/composer glass-panel hidden h-21 shrink-0 items-center justify-center border-t-0 border-glass-border min-[720px]:flex">
      <div className="flex w-full max-w-3xl flex-col items-stretch justify-center gap-2 px-3 @md/composer:flex-row @md/composer:items-center">
        <Button asChild variant="outline" className="gap-2">
          <Link
            href={
              canRerun ? workspaceUrlForRerun(userPrompt!) : "/workspace"
            }
          >
            {canRerun ? (
              <RotateCw className="size-4" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            {canRerun ? "Rerun simulation" : "New simulation"}
          </Link>
        </Button>
        <OpenInForgeButton runId={runId} isAuthenticated={isAuthenticated} />
      </div>
    </footer>
  );
}
