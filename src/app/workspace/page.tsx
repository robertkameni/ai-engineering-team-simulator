import { Suspense } from "react";

import { SimulationWorkspace } from "@/features/workspace/simulation-workspace";
import { WorkspaceView } from "@/features/workspace/workspace-view";
import { WorkspacePageSkeleton } from "@/features/workspace/workspace-page-skeleton";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";
import { listRecentRunsForSidebar } from "@/lib/db/runs";
import { isWorkspacePrepareMode } from "@/lib/workspace-url";

interface WorkspacePageProps {
  searchParams: Promise<{ prompt?: string; prepare?: string | string[] }>;
}

async function WorkspacePageBody({
  prompt,
  prepare,
}: {
  prompt: string | undefined;
  prepare: boolean;
}) {
  const [ownership, session] = await Promise.all([
    getRunOwnershipContext(),
    getSessionUser(),
  ]);
  const recentRuns = await listRecentRunsForSidebar(ownership, 12);
  const isAuthenticated = session.userId != null;

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

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  const params = await searchParams;
  const prompt = params.prompt?.trim();
  const prepareRaw = Array.isArray(params.prepare)
    ? params.prepare[0]
    : params.prepare;
  const prepare = isWorkspacePrepareMode(prepareRaw);

  return (
    <Suspense fallback={<WorkspacePageSkeleton />}>
      <WorkspacePageBody prompt={prompt} prepare={prepare} />
    </Suspense>
  );
}
