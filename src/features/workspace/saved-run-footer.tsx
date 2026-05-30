import Link from "next/link";
import { Plus, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  hasWorkspacePrompt,
  workspaceUrlForRerun,
} from "@/lib/workspace-url";

interface SavedRunFooterProps {
  userPrompt?: string;
}

/** Lightweight footer for saved runs — no composer client bundle. */
export function SavedRunFooter({ userPrompt }: SavedRunFooterProps) {
  const canRerun = hasWorkspacePrompt(userPrompt);

  return (
    <footer className="@container/composer glass-panel hidden h-21 shrink-0 items-center justify-center border-t-0 border-glass-border min-[720px]:flex">
      <Button asChild className="gap-2">
        <Link
          href={
            canRerun
              ? workspaceUrlForRerun(userPrompt!)
              : "/workspace"
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
    </footer>
  );
}
