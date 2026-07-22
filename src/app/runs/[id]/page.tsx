import { Suspense } from "react";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { SavedRunWorkspace } from "@/features/workspace/saved-run-workspace";
import { SidebarRunsSkeleton } from "@/features/workspace/workspace-page-skeleton";
import {
  getRunForWorkspaceIfOwned,
  listRecentRunsForSidebar,
} from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";
import { rosterToPreview } from "@/features/simulation/team-roster-preview";
import type { MockRun } from "@/features/agents/types";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

const getCachedRunPageView = cache(async (id: string) => {
  const scope = await getRunOwnershipContext();
  return getRunForWorkspaceIfOwned(id, scope);
});

export async function generateMetadata({
  params,
}: RunPageProps): Promise<Metadata> {
  const { id } = await params;
  const run = await getCachedRunPageView(id);
  if (!run) return { title: "Run not found" };
  return { title: run.title };
}

async function SavedRunPageBody({
  id,
  run,
}: {
  id: string;
  run: MockRun;
}) {
  const ownership = await getRunOwnershipContext();
  const [recentRuns, teamRosterRecord, session] = await Promise.all([
    listRecentRunsForSidebar(ownership, 12),
    getTeamRoster(id),
    getSessionUser(),
  ]);

  const canRegenerateArtifacts =
    run.messages.length > 0 &&
    (run.status === "complete" || run.status === "failed");

  return (
    <SavedRunWorkspace
      run={run}
      pathname={`/runs/${id}`}
      regenerateRunId={canRegenerateArtifacts ? run.id : undefined}
      canRegenerateArtifacts={canRegenerateArtifacts}
      initialRecentRuns={recentRuns}
      teamRoster={
        teamRosterRecord != null ? rosterToPreview(teamRosterRecord) : null
      }
      isAuthenticated={session.userId != null}
      userEmail={session.email}
    />
  );
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  // Ownership/404 before Suspense so a missing run never spins the skeleton forever (F5).
  const run = await getCachedRunPageView(id);
  if (!run) {
    notFound();
  }

  const canRegenerateArtifacts =
    run.messages.length > 0 &&
    (run.status === "complete" || run.status === "failed");
  const pathname = `/runs/${id}`;

  return (
    <Suspense
      fallback={
        <SavedRunWorkspace
          run={run}
          pathname={pathname}
          initialRecentRuns={[]}
          sidebar={<SidebarRunsSkeleton />}
          regenerateRunId={canRegenerateArtifacts ? run.id : undefined}
          canRegenerateArtifacts={canRegenerateArtifacts}
        />
      }
    >
      <SavedRunPageBody id={id} run={run} />
    </Suspense>
  );
}
