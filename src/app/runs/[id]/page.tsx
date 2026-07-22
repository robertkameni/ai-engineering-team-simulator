import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SavedRunWorkspace } from "@/features/workspace/saved-run-workspace";
import { SidebarRunsSkeleton } from "@/features/workspace/workspace-page-skeleton";
import {
  listRecentRunsForSidebar,
  type RunWorkspaceView,
} from "@/lib/db/runs";
import { getRunOwnershipContext } from "@/lib/auth/run-ownership";
import { getSessionUser } from "@/lib/auth/session";
import { rosterToPreview } from "@/features/simulation/team-roster-preview";

import { getCachedRunPageView } from "./get-cached-run-page-view";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

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
  run: RunWorkspaceView;
}) {
  // Ownership/session are React.cache-deduped with getCachedRunPageView.
  const [recentRuns, session] = await Promise.all([
    listRecentRunsForSidebar(await getRunOwnershipContext(), 12),
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
        run.teamRoster != null ? rosterToPreview(run.teamRoster) : null
      }
      isAuthenticated={session.userId != null}
      userEmail={session.email}
    />
  );
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  // Layout already gates 404 outside loading.tsx; keep a defense-in-depth check.
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
          teamRoster={
            run.teamRoster != null ? rosterToPreview(run.teamRoster) : null
          }
        />
      }
    >
      <SavedRunPageBody id={id} run={run} />
    </Suspense>
  );
}
