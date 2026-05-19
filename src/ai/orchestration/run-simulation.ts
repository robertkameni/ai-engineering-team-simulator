import { streamText } from "ai";

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
import { getDeepSeekModel } from "@/ai/providers";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  appendMessage,
  createRun,
  updateRunStatus,
} from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
) {
  const run = await createRun(productIdea);
  const roster = createSimulationRoster();
  await saveTeamRoster(run.id, roster);

  send({ type: "run_started", runId: run.id });

  const transcript: TranscriptEntry[] = [];
  let messageOrder = 0;

  try {
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

    await updateRunStatus(run.id, "complete");
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

  send({ type: "agent_end", role });
  return fullText;
}
