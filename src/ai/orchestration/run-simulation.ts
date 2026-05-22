import { streamText } from "ai";

import { generateRunArtifacts } from "@/ai/artifacts/generate-run-artifacts";
import {
  SIMULATION_AGENT_ORDER,
  getAgentConfig,
  isSimulationAgent,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import type { TeamRoster } from "@/ai/agents/roster";
import { buildAgentMessages } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getAgentSystemPrompt } from "@/ai/prompts";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { getDeepSeekModel } from "@/ai/providers";
import {
  runArtifactsOutputToBundle,
  saveArtifactBundle,
} from "@/lib/db/artifacts";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  appendMessage,
  createRun,
  updateRunStatus,
} from "@/lib/db/runs";
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
) {
  const run = await createRun(productIdea);

  const transcript: TranscriptEntry[] = [];
  let messageOrder = 0;

  try {
    const roster = createSimulationRoster();
    await saveTeamRoster(run.id, roster);

    send({ type: "run_started", runId: run.id });

    for (const role of SIMULATION_AGENT_ORDER) {
      if (!isSimulationAgent(role)) continue;

      const fullText = await streamAgentTurn({
        role,
        productIdea,
        transcript,
        roster,
        send,
      });

      const member = getTeamMember(roster, role);
      transcript.push({
        role,
        agentName: member.name,
        content: fullText,
      });

      await appendMessage(
        run.id,
        role,
        fullText,
        messageOrder,
        member.name,
      );
      messageOrder += 1;
    }

    await updateArtifactStatus(run.id, "pending");

    send({ type: "artifacts_start" });
    await updateArtifactStatus(run.id, "generating");

    try {
      const artifactOutput = await generateRunArtifacts({
        productIdea,
        transcript,
        roster,
      });
      const bundle = runArtifactsOutputToBundle(artifactOutput);
      await saveArtifactBundle(run.id, bundle);
      await updateArtifactStatus(run.id, "ready");
      await updateRunStatus(run.id, "complete");
      send({ type: "artifacts_ready", runId: run.id });
    } catch (artifactError) {
      console.error("Artifact generation failed:", artifactError);
      await updateArtifactStatus(run.id, "failed");
      await updateRunStatus(run.id, "complete");
      send({
        type: "artifacts_failed",
        message:
          artifactError instanceof Error
            ? artifactError.message
            : "Artifact generation failed",
      });
    }

    send({ type: "done", runId: run.id });
  } catch (error) {
    await updateRunStatus(run.id, "failed");
    throw error;
  }
}

async function streamAgentTurn({
  role,
  productIdea,
  transcript,
  roster,
  send,
}: {
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  send: (event: SimulationStreamEvent) => void;
}): Promise<string> {
  const config = getAgentConfig(role);
  const member = getTeamMember(roster, role);

  send({
    type: "agent_start",
    role,
    name: member.name,
    title: member.title,
  });

  let fullText = await collectAgentStream({
    role,
    productIdea,
    transcript,
    roster,
    config,
    send,
  });

  if (!fullText.trim()) {
    console.warn(`Empty response for ${role}, retrying with expanded budget`);
    fullText = await collectAgentStream({
      role,
      productIdea,
      transcript,
      roster,
      config: {
        ...config,
        maxOutputTokens: Math.max(config.maxOutputTokens * 2, 900),
        deepseek: DEEPSEEK_CHAT_OPTIONS,
      },
      send,
    });
  }

  send({ type: "agent_end", role });
  return fullText.trim() || `[${member.name} had no visible output — check API limits.]`;
}

async function collectAgentStream({
  role,
  productIdea,
  transcript,
  roster,
  config,
  send,
}: {
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  config: ReturnType<typeof getAgentConfig>;
  send: (event: SimulationStreamEvent) => void;
}): Promise<string> {
  const result = streamText({
    model: getDeepSeekModel(config.model),
    system: getAgentSystemPrompt(role, roster),
    messages: buildAgentMessages(role, productIdea, transcript, roster),
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    providerOptions: {
      deepseek: config.deepseek,
    },
  });

  let fullText = "";
  for await (const delta of result.textStream) {
    fullText += delta;
    send({ type: "text-delta", role, delta });
  }
  return fullText;
}
