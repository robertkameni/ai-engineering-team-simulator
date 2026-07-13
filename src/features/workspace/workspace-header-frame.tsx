import type { ReactNode } from "react";

import { WorkspaceHeaderActions } from "@/features/workspace/workspace-header-actions";
import {
  WorkspaceHeaderHomeButton,
  WorkspaceHeaderTitle,
} from "@/features/workspace/workspace-header-brand";
import { workspaceHeaderClassName } from "@/features/workspace/workspace-header-layout";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderFrameProps {
  title: string;
  subtitle?: string;
  brandLeading?: ReactNode;
  actions: ReactNode;
  className?: string;
}

export function WorkspaceHeaderFrame({
  title,
  subtitle,
  brandLeading,
  actions,
  className,
}: WorkspaceHeaderFrameProps) {
  return (
    <header className={cn(workspaceHeaderClassName, className)}>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {brandLeading}
        <WorkspaceHeaderHomeButton />
        <WorkspaceHeaderTitle title={title} subtitle={subtitle} />
      </div>
      <WorkspaceHeaderActions>{actions}</WorkspaceHeaderActions>
    </header>
  );
}
