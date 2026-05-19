import { notFound } from "next/navigation";

import { RunWorkspace } from "@/features/workspace/run-workspace";
import { getRunForWorkspace } from "@/lib/db/runs";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  const run = await getRunForWorkspace(id);

  if (!run) {
    notFound();
  }

  return <RunWorkspace run={run} />;
}
