import { WorkspaceView } from "@/features/workspace/workspace-view";
import { MOCK_ACTIVE_RUN } from "@/features/simulation/mock-data";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;

  // Static demo: all run IDs show the sample debate until DB is wired
  const run = { ...MOCK_ACTIVE_RUN, id };

  return <WorkspaceView run={run} />;
}
