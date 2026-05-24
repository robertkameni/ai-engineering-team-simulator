import { streamText } from "ai";

import {
  SIMULATION_AGENT_ORDER,
  getAgentConfig,
  isSimulationAgent,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildAgentMessages } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { classifyProjectTeamTemplate } from "@/ai/orchestration/classify-project";
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

const STREAM_HEARTBEAT_MS = 15_000;

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
): Promise<string> {
  const run = await createRun(productIdea);

  const transcript: TranscriptEntry[] = [];
  let messageOrder = 0;
  let debateComplete = false;
  let artifactPhaseStarted = false;

  try {
    const classification = await classifyProjectTeamTemplate(productIdea);
    const roster = createSimulationRoster(classification.templateId);
    await saveTeamRoster(run.id, roster);
    await touchRunActivity(run.id);

    const notify = (event: SimulationStreamEvent) => {
      try {
        send(event);
      } catch (error) {
        console.warn("Simulation stream: failed to notify client", {
          eventType: event.type,
          runId: run.id,
          error,
        });
      }
    };

    notify({ type: "run_started", runId: run.id });

    for (const role of SIMULATION_AGENT_ORDER) {
      if (!isSimulationAgent(role)) continue;

      await touchRunActivity(run.id);

      const fullText = await streamAgentTurn({
        runId: run.id,
        role,
        productIdea,
        transcript,
        roster,
        templateId: classification.templateId,
        send: notify,
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
    artifactPhaseStarted = true;

    notify({ type: "artifacts_start" });
    notify({ type: "done", runId: run.id });
    return run.id;
  } catch (error) {
    await reconcileRunFailure(run.id, {
      debateComplete,
      artifactPhaseStarted,
    });
    throw error;
  }
}

async function streamAgentTurn({
  runId,
  role,
  productIdea,
  transcript,
  roster,
  templateId,
  send,
}: {
  runId: string;
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  templateId: TeamTemplateId;
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
      runId,
      role,
      productIdea,
      transcript,
      roster,
      templateId,
      config,
      send,
    });

    if (!fullText.trim()) {
      console.warn(`Empty response for ${role}, retrying with expanded budget`);
      fullText = await collectAgentStream({
        runId,
        role,
        productIdea,
        transcript,
        roster,
        templateId,
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
  runId,
  role,
  productIdea,
  transcript,
  roster,
  templateId,
  config,
  send,
}: {
  runId: string;
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  templateId: TeamTemplateId;
  config: ReturnType<typeof getAgentConfig>;
  send: (event: SimulationStreamEvent) => void;
}): Promise<string> {
  const result = streamText({
    model: getDeepSeekModel(config.model),
    system: getAgentSystemPrompt(role, roster, templateId),
    messages: buildAgentMessages(role, productIdea, transcript, roster),
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    providerOptions: {
      deepseek: config.deepseek,
    },
  });

  let fullText = "";
  let lastHeartbeatAt = Date.now();
  try {
    for await (const delta of result.textStream) {
      fullText += delta;
      send({ type: "text-delta", role, delta });

      const now = Date.now();
      if (now - lastHeartbeatAt >= STREAM_HEARTBEAT_MS) {
        await touchRunActivity(runId);
        lastHeartbeatAt = now;
      }
    }
  } catch (error) {
    if (fullText.trim()) {
      return fullText;
    }
    throw error;
  }
  return fullText;
}
