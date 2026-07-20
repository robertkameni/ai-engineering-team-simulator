import { stepCountIs, streamText, type ModelMessage } from "ai";

import {
  getAgentConfig,
  type SimulationAgentRole
} from "@/ai/agents/config";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { buildAgentMessages, type DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { windowTranscriptForContinuation } from "@/ai/context/window-transcript";
import { hasPhysicalKeywords } from "@/ai/orchestration/classify-project";
import type { CollectAgentStreamParams } from "@/ai/orchestration/agent-stream-context.types";
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

export async function collectAgentStream(
  params: CollectAgentStreamParams,
): Promise<string> {
  const {
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
  } = params;

  const messages = buildStreamMessages({
    role,
    productIdea,
    transcript,
    roster,
    debateContext,
    continuationOf,
    supplementalUserPrompt,
  });

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

  const streamState = createStreamEmitState();
  try {
    await consumeAgentStreamParts({
      result,
      role,
      runId,
      abortSignal,
      send,
      streamState,
    });

    await emitResolvedTextIfEmpty({
      result,
      role,
      send,
      streamState,
    });

    await recordStreamUsage(result, config.model, usageAccumulator);
  } catch (error) {
    await recordStreamUsage(result, config.model, usageAccumulator);
    if (isSimulationAborted(error)) {
      throw error;
    }
    if (streamState.fullText.trim()) {
      return streamState.fullText.trim();
    }
    throw error;
  }
  return streamState.fullText.trim();
}

interface StreamEmitState {
  fullText: string;
  emittedLength: number;
  normalizedText: string;
  normalizedRawLength: number;
}

function createStreamEmitState(): StreamEmitState {
  return {
    fullText: "",
    emittedLength: 0,
    normalizedText: "",
    normalizedRawLength: 0,
  };
}

async function consumeAgentStreamParts({
  result,
  role,
  runId,
  abortSignal,
  send,
  streamState,
}: {
  result: ReturnType<typeof streamText>;
  role: SimulationAgentRole;
  runId: string;
  abortSignal?: AbortSignal;
  send: (event: SimulationStreamEvent) => void;
  streamState: StreamEmitState;
}): Promise<void> {
  let lastHeartbeatAt = Date.now();

  for await (const part of result.fullStream) {
    assertNotAborted(abortSignal);

    if (part.type === "text-delta") {
      processTextDeltaPart(part.text, role, send, streamState);
    } else if (part.type === "tool-call") {
      emitToolCallPart(part, role, send);
    } else if (part.type === "tool-result") {
      send({
        type: "tool_end",
        role,
        toolName: part.toolName,
      });
    }

    lastHeartbeatAt = await maybeTouchRunActivity(runId, lastHeartbeatAt);
  }
}

function processTextDeltaPart(
  deltaText: string,
  role: SimulationAgentRole,
  send: (event: SimulationStreamEvent) => void,
  streamState: StreamEmitState,
): void {
  streamState.fullText += deltaText;

  if (role === "architect" && !hasCompletedOpeningBlock(streamState.fullText)) {
    if (!/^##\s/m.test(streamState.fullText)) {
      return;
    }
  }

  const rawSuffix = streamState.fullText.slice(streamState.normalizedRawLength);
  const isFirstChunk = streamState.normalizedText.length === 0;
  streamState.normalizedText += normalizeAgentSuffix(role, rawSuffix, isFirstChunk);
  streamState.normalizedRawLength = streamState.fullText.length;

  const display =
    role === "reviewer"
      ? reviewerVisibleText(streamState.normalizedText)
      : streamState.normalizedText;

  const delta = display.slice(streamState.emittedLength);
  if (!delta) {
    return;
  }

  send({ type: "text-delta", role, delta });
  streamState.emittedLength += delta.length;
}

function emitToolCallPart(
  part: { toolName: string; input?: unknown; args?: unknown; },
  role: SimulationAgentRole,
  send: (event: SimulationStreamEvent) => void,
): void {
  send({
    type: "tool_start",
    role,
    toolName: part.toolName,
    args: part.input ?? part.args,
  });
}

async function maybeTouchRunActivity(
  runId: string,
  lastHeartbeatAt: number,
): Promise<number> {
  const now = Date.now();
  if (now - lastHeartbeatAt < STREAM_HEARTBEAT_MS) {
    return lastHeartbeatAt;
  }

  await touchRunActivity(runId);
  return now;
}

async function emitResolvedTextIfEmpty({
  result,
  role,
  send,
  streamState,
}: {
  result: ReturnType<typeof streamText>;
  role: SimulationAgentRole;
  send: (event: SimulationStreamEvent) => void;
  streamState: StreamEmitState;
}): Promise<void> {
  if (streamState.fullText.trim()) {
    return;
  }

  const resolved = await result.text;
  if (!resolved.trim()) {
    return;
  }

  streamState.fullText = resolved;
  const visible = getAgentStreamDisplayText(role, streamState.fullText);
  const delta = visible.slice(streamState.emittedLength);
  if (!delta) {
    return;
  }

  send({ type: "text-delta", role, delta });
  streamState.emittedLength += delta.length;
}

function buildStreamMessages(params: {
  readonly role: SimulationAgentRole;
  readonly productIdea: string;
  readonly transcript: TranscriptEntry[];
  readonly roster: TeamRoster;
  readonly debateContext?: DebateTurnContext;
  readonly continuationOf?: string;
  readonly supplementalUserPrompt?: string;
}): ModelMessage[] {
  const isContinuation =
    params.continuationOf != null && params.continuationOf.trim().length > 0;

  let messages = isContinuation
    ? buildContinuationMessages({
        role: params.role,
        productIdea: params.productIdea,
        transcript: params.transcript,
        roster: params.roster,
        continuationOf: params.continuationOf!,
      })
    : buildAgentMessages(
        params.role,
        params.productIdea,
        params.transcript,
        params.roster,
        params.debateContext,
      );

  if (params.supplementalUserPrompt?.trim() && !isContinuation) {
    messages = [
      ...messages,
      { role: "user" as const, content: params.supplementalUserPrompt.trim() },
    ];
  }

  return messages;
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

function buildContinuationMessages(params: {
  readonly role: SimulationAgentRole;
  readonly productIdea: string;
  readonly transcript: TranscriptEntry[];
  readonly roster: TeamRoster;
  readonly continuationOf: string;
}): ModelMessage[] {
  const windowed = windowTranscriptForContinuation(
    params.transcript,
    params.roster,
  );
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    {
      role: "user",
      content: `## Product idea\n\n${params.productIdea}`,
    },
  ];

  if (windowed.omittedSummary) {
    messages.push({ role: "user", content: windowed.omittedSummary });
  }

  messages.push({
    role: "assistant",
    content: params.continuationOf,
  });
  messages.push({
    role: "user",
    content: buildTruncationContinuationPrompt(
      params.continuationOf,
      params.role,
    ),
  });

  return messages;
}

async function recordStreamUsage(
  result: StreamTextUsageSource,
  modelId: ReturnType<typeof getAgentConfig>["model"],
  usageAccumulator: RunUsageAccumulator,
): Promise<void> {
  await usageAccumulator.addFromStreamResult(result, modelId);
}
