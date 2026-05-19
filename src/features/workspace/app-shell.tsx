import { Sidebar } from "@/features/workspace/sidebar";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      <ArtifactPanel />
    </div>
  );
}
