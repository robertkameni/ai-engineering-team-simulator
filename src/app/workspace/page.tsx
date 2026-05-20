import { SimulationWorkspace } from "@/features/workspace/simulation-workspace";
import { WorkspaceView } from "@/features/workspace/workspace-view";

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

  return (
    <WorkspaceView
      showEmptyThread
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
