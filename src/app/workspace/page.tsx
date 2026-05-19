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

  const run = prompt
    ? { ...MOCK_ACTIVE_RUN, title: truncateTitle(prompt), userPrompt: prompt }
    : MOCK_ACTIVE_RUN;

  return (
    <WorkspaceView
      run={run}
      showEmptyThread={Boolean(prompt)}
      initialPrompt={prompt}
    />
  );
}

function truncateTitle(prompt: string, max = 48) {
  if (prompt.length <= max) return prompt;
  return `${prompt.slice(0, max).trim()}…`;
}
