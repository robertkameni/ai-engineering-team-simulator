import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SavedRunWorkspace } from "@/features/workspace/saved-run-workspace";
import {
  getRunForWorkspace,
  listRecentRunsForSidebar,
} from "@/lib/db/runs";
import { getTeamRoster } from "@/lib/db/team-roster";
import { rosterToPreview } from "@/features/simulation/team-roster-preview";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

const getCachedRun = cache(getRunForWorkspace);

export async function generateMetadata({
  params,
}: RunPageProps): Promise<Metadata> {
  const { id } = await params;
  const run = await getCachedRun(id);
  if (!run) return { title: "Run not found" };
  return { title: run.title };
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  const [run, recentRuns, teamRosterRecord] = await Promise.all([
    getCachedRun(id),
    listRecentRunsForSidebar(12),
    getTeamRoster(id),
  ]);

  if (!run) {
    notFound();
  }

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
    />
  );
}
