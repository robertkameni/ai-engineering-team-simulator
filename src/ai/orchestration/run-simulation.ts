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
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  appendMessage,
  createRun,
  touchRunActivity,
} from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
) {
  const run = await createRun(productIdea);

  const transcript: TranscriptEntry[] = [];
  let messageOrder = 0;
  let debateComplete = false;

  try {
    const roster = createSimulationRoster();
    await saveTeamRoster(run.id, roster);
    await touchRunActivity(run.id);

    send({ type: "run_started", runId: run.id });

    for (const role of SIMULATION_AGENT_ORDER) {
      if (!isSimulationAgent(role)) continue;

      await touchRunActivity(run.id);

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

    debateComplete = true;

    await updateArtifactStatus(run.id, "pending");
    send({ type: "artifacts_start" });
    send({ type: "done", runId: run.id });
  } catch (error) {
    if (!debateComplete) {
      await reconcileRunFailure(run.id, {
        debateComplete: false,
        artifactPhaseStarted: false,
      });
    }
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

  let fullText: string;
  try {
    fullText = await collectAgentStream({
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
        },
        send,
      });
    }
  } catch (streamError) {
    send({ type: "agent_end", role });
    throw streamError;
  }

  if (!fullText.trim()) {
    send({ type: "agent_end", role });
    throw new Error(
      `${member.name} (${role}) returned no output — check API limits or retry.`,
    );
  }

  send({ type: "agent_end", role });
  return fullText.trim();
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
  try {
    for await (const delta of result.textStream) {
      fullText += delta;
      send({ type: "text-delta", role, delta });
    }
  } catch (error) {
    if (fullText.trim()) {
      return fullText;
    }
    throw error;
  }
  return fullText;
}
