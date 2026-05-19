import { SimulationWorkspace } from "@/features/workspace/simulation-workspace";
import { WorkspaceView } from "@/features/workspace/workspace-view";
import { MOCK_ACTIVE_RUN } from "@/features/simulation/mock-data";

interface WorkspacePageProps {
  searchParams: Promise<{ prompt?: string }>;
}

export default async function WorkspacePage({
  searchParams,
}: WorkspacePageProps) {
  const params = await searchParams;
  const prompt = params.prompt?.trim();

  if (prompt) {
    return (
      <SimulationWorkspace
        userPrompt={prompt}
        title={truncateTitle(prompt)}
      />
    );
  }

  const run = MOCK_ACTIVE_RUN;

  return <WorkspaceView run={run} />;
}

function truncateTitle(prompt: string, max = 48) {
  if (prompt.length <= max) return prompt;
  return `${prompt.slice(0, max).trim()}…`;
}
