import { Sidebar } from "@/features/workspace/sidebar";
import { ArtifactPanel } from "@/features/artifacts/artifact-panel";
import type {
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";

interface AppShellProps {
  children: React.ReactNode;
  artifacts?: RunArtifacts | null;
  artifactsStatus?: ArtifactsPanelStatus;
}

export function AppShell({
  children,
  artifacts = null,
  artifactsStatus = "idle",
}: AppShellProps) {
  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <ArtifactPanel artifacts={artifacts} status={artifactsStatus} />
    </div>
  );
}
