import { stepCountIs, streamText } from "ai";

import {
  SIMULATION_AGENT_ORDER,
  getAgentConfig,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildAgentMessages } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { classifyProjectTeamTemplate } from "@/ai/orchestration/classify-project";
import {
  MAX_SIMULATION_TURNS,
  parseReviewerDecision,
  reviewerVisibleText,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import { getAgentSystemPrompt } from "@/ai/prompts";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { getDeepSeekModel } from "@/ai/providers";
import { agentTools } from "@/ai/tools/registry";
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
const AGENT_TURN_FALLBACK = "[Tool Error: Agent failed to respond]";

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
    notify({
      type: "team_ready",
      templateId: classification.templateId,
      members: SIMULATION_AGENT_ORDER.map((role) => {
        const member = getTeamMember(roster, role);
        return {
          role,
          name: member.name,
          title: member.title,
        };
      }),
    });

    let turnCount = 0;
    let roleIndex = 0;
    let returnToReviewer = false;
    let nextRole: SimulationAgentRole = SIMULATION_AGENT_ORDER[0];

    while (turnCount < MAX_SIMULATION_TURNS) {
      const role = nextRole;

      await touchRunActivity(run.id);

      const member = getTeamMember(roster, role);
      let fullText: string;

      try {
        fullText = await streamAgentTurn({
          runId: run.id,
          role,
          productIdea,
          transcript,
          roster,
          templateId: classification.templateId,
          send: notify,
        });
      } catch (turnError) {
        console.error(`Agent turn failed (${role}):`, turnError);
        fullText = AGENT_TURN_FALLBACK;
        emitFallbackAgentTurn(role, member.name, member.title, fullText, notify);
      }

      const contentToPersist = stripReviewerDecisionTag(fullText);

      transcript.push({
        role,
        agentName: member.name,
        content: contentToPersist,
      });

      await appendMessage(
        run.id,
        role,
        contentToPersist,
        messageOrder,
        member.name,
      );
      messageOrder += 1;
      turnCount += 1;

      if (role === "reviewer") {
        const parsed = parseReviewerDecision(fullText);

        if (parsed.decision === "approve") {
          break;
        }

        if (parsed.decision === "reject" && parsed.rejectRole) {
          nextRole = parsed.rejectRole;
          returnToReviewer = true;
          continue;
        }

        console.warn("Invalid reviewer decision, defaulting to approve", {
          runId: run.id,
          decision: parsed.decision,
        });
        break;
      }

      if (returnToReviewer) {
        nextRole = "reviewer";
        returnToReviewer = false;
      } else {
        roleIndex += 1;
        if (roleIndex >= SIMULATION_AGENT_ORDER.length) {
          break;
        }
        nextRole = SIMULATION_AGENT_ORDER[roleIndex];
      }
    }

    if (turnCount >= MAX_SIMULATION_TURNS) {
      console.warn("Simulation reached MAX_SIMULATION_TURNS", { runId: run.id });
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

/** Re-emit a complete turn so the client receives fallback text after a failed stream. */
function emitFallbackAgentTurn(
  role: SimulationAgentRole,
  name: string,
  title: string,
  content: string,
  send: (event: SimulationStreamEvent) => void,
): void {
  send({ type: "agent_start", role, name, title });
  send({ type: "text-delta", role, delta: content });
  send({ type: "agent_end", role });
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
      console.warn(
        `${role}: empty stream, retrying with chat model (no reasoning)`,
      );
      fullText = await collectAgentStream({
        runId,
        role,
        productIdea,
        transcript,
        roster,
        templateId,
        config: {
          ...config,
          model: "deepseek-v4-flash",
          maxOutputTokens: Math.max(config.maxOutputTokens * 2, 900),
          deepseek: DEEPSEEK_CHAT_OPTIONS,
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

function emitVisibleDelta(
  role: SimulationAgentRole,
  fullText: string,
  emittedLength: number,
  send: (event: SimulationStreamEvent) => void,
): number {
  const visible =
    role === "reviewer" ? reviewerVisibleText(fullText) : fullText;
  const delta = visible.slice(emittedLength);
  if (delta) {
    send({ type: "text-delta", role, delta });
    return emittedLength + delta.length;
  }
  return emittedLength;
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
    tools: agentTools,
    stopWhen: stepCountIs(3),
    providerOptions: {
      deepseek: config.deepseek,
    },
    onError({ error }) {
      console.error(`Stream error for ${role}:`, error);
    },
  });

  let fullText = "";
  let emittedLength = 0;
  let lastHeartbeatAt = Date.now();
  try {
    for await (const delta of result.textStream) {
      fullText += delta;
      emittedLength = emitVisibleDelta(role, fullText, emittedLength, send);

      const now = Date.now();
      if (now - lastHeartbeatAt >= STREAM_HEARTBEAT_MS) {
        await touchRunActivity(runId);
        lastHeartbeatAt = now;
      }
    }

    if (!fullText.trim()) {
      const resolved = await result.text;
      if (resolved.trim()) {
        fullText = resolved;
        emitVisibleDelta(role, fullText, emittedLength, send);
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
