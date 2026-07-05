import { stepCountIs, streamText } from "ai";

import {
  getAgentConfig,
  type SimulationAgentRole
} from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildAgentMessages, type DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { hasPhysicalKeywords } from "@/ai/orchestration/classify-project";
import {
  getAgentStreamDisplayText,
  hasCompletedOpeningBlock,
  normalizeAgentSuffix,
} from "@/ai/orchestration/agent-stream-text";
import {
  buildTruncationContinuationPrompt
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import { reviewerVisibleText } from "@/ai/orchestration/reviewer-decision";
import { getAgentSystemPrompt } from "@/ai/prompts";
import { getDeepSeekModel } from "@/ai/providers";
import { getAgentTools, getComplianceTools } from "@/ai/tools/registry";
import {
  RunUsageAccumulator,
  type StreamTextUsageSource,
} from "@/lib/ai/run-usage-accumulator";
import { touchRunActivity } from "@/lib/db/runs";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { assertNotAborted, isSimulationAborted } from "./simulation-abort";

const STREAM_HEARTBEAT_MS = 15_000;

export async function collectAgentStream({
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
  continuationOf,
  disableTools = false,
  supplementalUserPrompt,
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
  continuationOf?: string;
  disableTools?: boolean;
  supplementalUserPrompt?: string;
}): Promise<string> {
  const baseMessages = buildAgentMessages(
    role,
    productIdea,
    transcript,
    roster,
    debateContext,
  );
  let messages = baseMessages;

  if (supplementalUserPrompt?.trim()) {
    messages = [
      ...messages,
      { role: "user" as const, content: supplementalUserPrompt.trim() },
    ];
  }

  if (continuationOf != null && continuationOf.trim().length > 0) {
    messages = [
      ...messages,
      { role: "assistant" as const, content: continuationOf },
      {
        role: "user" as const,
        content: buildTruncationContinuationPrompt(continuationOf),
      },
    ];
  }

  const tools = disableTools
    ? undefined
    : resolveToolsForTurn(role, templateId, productIdea);

  const result = streamText({
    model: getDeepSeekModel(config.model),
    system: getAgentSystemPrompt(role, roster, templateId, productIdea),
    messages,
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
    tools,
    stopWhen: disableTools ? undefined : stepCountIs(3),
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
  let normalizedText = "";
  let normalizedRawLength = 0;
  try {
    for await (const part of result.fullStream) {
      assertNotAborted(abortSignal);

      if (part.type === "text-delta") {
        fullText += part.text;

        if (role === "architect" && !hasCompletedOpeningBlock(fullText)) {
          if (!/^##\s/m.test(fullText)) {
            continue;
          }
        }

        const rawSuffix = fullText.slice(normalizedRawLength);
        const isFirstChunk = normalizedText.length === 0;
        normalizedText += normalizeAgentSuffix(role, rawSuffix, isFirstChunk);
        normalizedRawLength = fullText.length;

        let display = normalizedText;
        if (role === "reviewer") {
          display = reviewerVisibleText(normalizedText);
        }

        const delta = display.slice(emittedLength);
        if (delta) {
          send({ type: "text-delta", role, delta });
          emittedLength += delta.length;
        }
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
        const visible = getAgentStreamDisplayText(role, fullText);
        const delta = visible.slice(emittedLength);
        if (delta) {
          send({ type: "text-delta", role, delta });
          emittedLength += delta.length;
        }
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

async function recordStreamUsage(
  result: StreamTextUsageSource,
  modelId: ReturnType<typeof getAgentConfig>["model"],
  usageAccumulator: RunUsageAccumulator,
): Promise<void> {
  await usageAccumulator.addFromStreamResult(result, modelId);
}
