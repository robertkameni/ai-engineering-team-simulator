import { stepCountIs, streamText } from "ai";

import {
  SIMULATION_AGENT_ORDER,
  getAgentConfig,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { createSimulationRoster, getTeamMember } from "@/ai/agents/roster";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildAgentMessages, resolveDebateTurnContext, type DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { classifyProjectTeamTemplate, hasPhysicalKeywords } from "@/ai/orchestration/classify-project";
import {
  getAgentStreamDisplayText,
  normalizeAgentPersistedText,
} from "@/ai/orchestration/agent-stream-text";
import {
  type DebateExitOutcome,
  MAX_SIMULATION_TURNS,
  parseReviewerDecision,
  resolveUnknownReviewerDecision,
  stripReviewerDecisionTag,
} from "@/ai/orchestration/reviewer-decision";
import { getAgentSystemPrompt } from "@/ai/prompts";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { getDeepSeekModel } from "@/ai/providers";
import { getAgentTools, getComplianceTools } from "@/ai/tools/registry";
import {
  RunUsageAccumulator,
  type StreamTextUsageSource,
} from "@/lib/ai/run-usage-accumulator";
import { updateArtifactStatus } from "@/lib/db/artifact-status";
import { reconcileRunFailure } from "@/lib/db/run-reconcile";
import { saveTeamRoster } from "@/lib/db/team-roster";
import {
  appendMessage,
  createRun,
  setRunUsageTotals,
  touchRunActivity,
  updateRunSummary,
} from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

const STREAM_HEARTBEAT_MS = 15_000;
const AGENT_TURN_FALLBACK = "[Tool Error: Agent failed to respond]";

export class SimulationAbortedError extends Error {
  override readonly name = "SimulationAbortedError";

  constructor(message = "Simulation cancelled") {
    super(message);
  }
}

export function isSimulationAborted(error: unknown): boolean {
  if (error instanceof SimulationAbortedError) {
    return true;
  }
  return error instanceof Error && error.name === "AbortError";
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SimulationAbortedError();
  }
}

export interface RunSimulationOptions {
  userId?: string | null;
  guestSessionId?: string | null;
  usageAccumulator?: RunUsageAccumulator;
  abortSignal?: AbortSignal;
}

export interface RunSimulationResult {
  runId: string;
  usageAccumulator: RunUsageAccumulator;
  debateExitOutcome: DebateExitOutcome;
}

export async function runSimulation(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
  options: RunSimulationOptions = {},
): Promise<RunSimulationResult> {
  const usageAccumulator =
    options.usageAccumulator ?? new RunUsageAccumulator();
  const abortSignal = options.abortSignal;
  const run = await createRun(productIdea, {
    userId: options.userId,
    guestSessionId: options.guestSessionId,
  });

  const transcript: TranscriptEntry[] = [];
  let messageOrder = 0;
  let debateComplete = false;
  let artifactPhaseStarted = false;

  try {
    assertNotAborted(abortSignal);

    const classification = await classifyProjectTeamTemplate(
      productIdea,
      usageAccumulator,
    );
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
    let debateExitOutcome: DebateExitOutcome | null = null;
    let lastRejectFeedback: string | null = null;
    let lastRejectTarget: SimulationAgentRole | null = null;

    while (turnCount < MAX_SIMULATION_TURNS) {
      assertNotAborted(abortSignal);

      const role = nextRole;

      await touchRunActivity(run.id);

      const member = getTeamMember(roster, role);
      let fullText: string;

      const debateContext = resolveDebateTurnContext(
        role,
        transcript,
        roster,
        lastRejectTarget,
        lastRejectFeedback,
      );

      try {
        fullText = await streamAgentTurn({
          runId: run.id,
          role,
          productIdea,
          transcript,
          roster,
          templateId: classification.templateId,
          usageAccumulator,
          abortSignal,
          debateContext,
          send: notify,
        });
      } catch (turnError) {
        if (isSimulationAborted(turnError)) {
          throw turnError;
        }
        console.error(`Agent turn failed (${role}):`, turnError);
        fullText = AGENT_TURN_FALLBACK;
        emitFallbackAgentTurn(role, member.name, member.title, fullText, notify);
      }

      const contentToPersist =
        role === "reviewer"
          ? stripReviewerDecisionTag(
              normalizeAgentPersistedText(role, fullText),
            )
          : normalizeAgentPersistedText(role, fullText);

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
          debateExitOutcome = "approved";
          lastRejectFeedback = null;
          lastRejectTarget = null;
          break;
        }

        if (parsed.decision === "reject" && parsed.rejectRole) {
          lastRejectFeedback = parsed.displayText.trim() || null;
          lastRejectTarget = parsed.rejectRole;
          nextRole = parsed.rejectRole;
          returnToReviewer = true;
          continue;
        }

        console.warn("Invalid reviewer decision, routing correction", {
          runId: run.id,
          decision: parsed.decision,
          rejectRole: parsed.rejectRole,
        });

        const fallback = resolveUnknownReviewerDecision();
        if (turnCount < MAX_SIMULATION_TURNS) {
          lastRejectFeedback = parsed.displayText.trim() || null;
          lastRejectTarget = fallback.rejectRole ?? "pm";
          nextRole = fallback.rejectRole ?? "pm";
          returnToReviewer = true;
          continue;
        }

        debateExitOutcome = "unknown_reject_fallback";
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

    if (debateExitOutcome === null) {
      debateExitOutcome = "cap_reached";
    }

    assertNotAborted(abortSignal);

    debateComplete = true;

    await updateRunSummary(
      run.id,
      JSON.stringify({ debateOutcome: debateExitOutcome, turnCount }),
    );

    await updateArtifactStatus(run.id, "pending");
    artifactPhaseStarted = true;

    notify({ type: "artifacts_start" });
    return { runId: run.id, usageAccumulator, debateExitOutcome };
  } catch (error) {
    await setRunUsageTotals(run.id, usageAccumulator.getTotals());
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
  usageAccumulator,
  abortSignal,
  debateContext,
  send,
}: {
  runId: string;
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  templateId: TeamTemplateId;
  usageAccumulator: RunUsageAccumulator;
  abortSignal?: AbortSignal;
  debateContext?: DebateTurnContext;
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
      debateContext,
      usageAccumulator,
      abortSignal,
      send,
    });

    if (!fullText.trim()) {
      assertNotAborted(abortSignal);
      console.warn(
        `${role}: empty stream, retrying with chat model (no reasoning)`,
      );
      const retryConfig = {
        ...config,
        model: "deepseek-v4-flash" as const,
        maxOutputTokens: Math.max(config.maxOutputTokens * 1.5, 1500),
        deepseek: DEEPSEEK_CHAT_OPTIONS,
      };
      fullText = await collectAgentStream({
        runId,
        role,
        productIdea,
        transcript,
        roster,
        templateId,
        config: retryConfig,
        debateContext,
        usageAccumulator,
        abortSignal,
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

  const persisted = normalizeAgentPersistedText(role, fullText);
  if (!persisted.trim()) {
    send({ type: "agent_end", role });
    throw new Error(
      `${member.name} (${role}) returned no visible output after normalization.`,
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
  const visible = getAgentStreamDisplayText(role, fullText);
  const delta = visible.slice(emittedLength);
  if (delta) {
    send({ type: "text-delta", role, delta });
    return emittedLength + delta.length;
  }
  return emittedLength;
}

async function recordStreamUsage(
  result: StreamTextUsageSource,
  modelId: ReturnType<typeof getAgentConfig>["model"],
  usageAccumulator: RunUsageAccumulator,
): Promise<void> {
  await usageAccumulator.addFromStreamResult(result, modelId);
}

function resolveToolsForTurn(
  role: SimulationAgentRole,
  templateId: TeamTemplateId,
  productIdea: string,
) {
  if (
    role === "backend" &&
    templateId === "hybrid" &&
    hasPhysicalKeywords(productIdea)
  ) {
    return getComplianceTools();
  }
  return getAgentTools(role);
}

async function collectAgentStream({
  runId,
  role,
  productIdea,
  transcript,
  roster,
  templateId,
  config,
  debateContext,
  usageAccumulator,
  abortSignal,
  send,
}: {
  runId: string;
  role: SimulationAgentRole;
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  templateId: TeamTemplateId;
  config: ReturnType<typeof getAgentConfig>;
  debateContext?: DebateTurnContext;
  usageAccumulator: RunUsageAccumulator;
  abortSignal?: AbortSignal;
  send: (event: SimulationStreamEvent) => void;
}): Promise<string> {
  const result = streamText({
    model: getDeepSeekModel(config.model),
    system: getAgentSystemPrompt(role, roster, templateId, productIdea),
    messages: buildAgentMessages(
      role,
      productIdea,
      transcript,
      roster,
      debateContext,
    ),
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    tools: resolveToolsForTurn(role, templateId, productIdea),
    stopWhen: stepCountIs(3),
    abortSignal,
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
    for await (const part of result.fullStream) {
      assertNotAborted(abortSignal);

      if (part.type === "text-delta") {
        fullText += part.text;
        emittedLength = emitVisibleDelta(role, fullText, emittedLength, send);
      } else if (part.type === "tool-call") {
        const toolPart = part as {
          toolName: string;
          input?: unknown;
          args?: unknown;
        };
        send({
          type: "tool_start",
          role,
          toolName: toolPart.toolName,
          args: toolPart.input ?? toolPart.args,
        });
      } else if (part.type === "tool-result") {
        send({
          type: "tool_end",
          role,
          toolName: part.toolName,
        });
      }

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

    await recordStreamUsage(result, config.model, usageAccumulator);
  } catch (error) {
    await recordStreamUsage(result, config.model, usageAccumulator);
    if (isSimulationAborted(error)) {
      throw error;
    }
    if (fullText.trim()) {
      return fullText.trim();
    }
    throw error;
  }
  return fullText.trim();
}
