import { SimulationWorkspace } from "@/features/workspace/simulation-workspace";
import { WorkspaceView } from "@/features/workspace/workspace-view";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";
import { listRecentRunsForSidebar } from "@/lib/db/runs";

interface WorkspacePageProps {
  searchParams: Promise<{ prompt?: string }>;
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

  if (prompt) {
    return (
      <SimulationWorkspace
        userPrompt={prompt}
        title={truncateTitle(prompt)}
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

function truncateTitle(prompt: string, max = 48) {
  if (prompt.length <= max) return prompt;
  return `${prompt.slice(0, max).trim()}…`;
}
