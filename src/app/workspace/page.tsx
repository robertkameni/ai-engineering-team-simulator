import { SimulationWorkspace } from "@/features/workspace/simulation-workspace";
import { WorkspaceView } from "@/features/workspace/workspace-view";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";
import { listRecentRunsForSidebar } from "@/lib/db/runs";
import { isWorkspacePrepareMode } from "@/lib/workspace-url";

interface WorkspacePageProps {
  searchParams: Promise<{ prompt?: string; prepare?: string | string[] }>;
}

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  const [params, ownership, session] = await Promise.all([
    searchParams,
    getRunOwnershipContext(),
    getSessionUser(),
  ]);
  const recentRuns = await listRecentRunsForSidebar(ownership, 12);
  const isAuthenticated = session.userId != null;
  const prompt = params.prompt?.trim();
  const prepare = isWorkspacePrepareMode(params.prepare);

  if (prompt) {
    return (
      <SimulationWorkspace
        key={prepare ? `prepare:${prompt}` : prompt}
        userPrompt={prompt}
        autoStart={!prepare}
        initialRecentRuns={recentRuns}
        isAuthenticated={isAuthenticated}
        userEmail={session.email}
      />
    );
  }

  return (
    <WorkspaceView
      showEmptyThread
      initialRecentRuns={recentRuns}
      isAuthenticated={isAuthenticated}
      userEmail={session.email}
      run={{
        id: "new",
        title: "New simulation",
        userPrompt: "",
        status: "idle",
        updatedAt: "",
        messages: [],
        artifactsStatus: "idle",
      }}
    />
  );
}
