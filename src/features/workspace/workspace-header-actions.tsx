import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface WorkspaceHeaderActionsProps {
  children: ReactNode;
  className?: string;
}

/** Right column — fixed auto width; scrolls internally when chips overflow. */
export function WorkspaceHeaderActions({
  children,
  className,
}: WorkspaceHeaderActionsProps) {
  return (
    <div
      className={cn(
        "flex max-w-full items-center justify-end gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] scrollbar-none [&::-webkit-scrollbar]:hidden",
        "@[720px]/app-shell:gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
