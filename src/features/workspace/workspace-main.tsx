import { cn } from "@/lib/utils";

interface WorkspaceMainProps {
  children: React.ReactNode;
  className?: string;
}

/** Scrollable middle column between header and composer. */
export function WorkspaceMain({ children, className }: WorkspaceMainProps) {
  return (
    <main className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
      {children}
    </main>
  );
}
