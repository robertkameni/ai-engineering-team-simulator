import {
  TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS,
  getAgentConfig,
  type SimulationAgentRole,
} from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { DebateTurnContext } from "@/ai/context/build-messages";
import type { TranscriptEntry } from "@/ai/context/transcript";
import {
  isArchitectDeliverableInsufficient,
} from "@/ai/orchestration/agent-deliverable-quality";
import { normalizeAgentPersistedText } from "@/ai/orchestration/agent-stream-text";
import { looksLikeTruncatedAgentOutput } from "@/ai/orchestration/looks-like-truncated-agent-output";
import { buildArchitectToollessRetryUserPrompt } from "@/ai/prompts/architect";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import { assertNotAborted } from "./simulation-abort";
import { collectAgentStream } from "./collect-agent-stream";

export async function streamAgentTurn({
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
  disableTools,
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
  disableTools?: boolean;
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
      disableTools,
    });

    if (!fullText.trim()) {
      assertNotAborted(abortSignal);
      console.warn(
        `${role}: empty stream, retrying with chat model (no reasoning)`,
      );
      const retryConfig = {
        ...config,
        model: "deepseek-v4-flash" as const,
        maxOutputTokens: Math.max(config.maxOutputTokens * 1.5, 2400),
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
      fullText = await continueAgentStreamIfTruncated({
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
        fullText,
      });
    }

    fullText = await continueAgentStreamIfTruncated({
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
      fullText,
    });

    if (role === "architect" && templateId !== "physical") {
      const normalized = normalizeAgentPersistedText(role, fullText);
      if (isArchitectDeliverableInsufficient(normalized, templateId)) {
        assertNotAborted(abortSignal);
        console.warn(
          `${role}: insufficient sections after tool turn, retrying without tools`,
        );
        const toollessConfig = {
          ...config,
          model: "deepseek-v4-flash" as const,
          maxOutputTokens: Math.max(config.maxOutputTokens, 3200),
          deepseek: DEEPSEEK_CHAT_OPTIONS,
        };
        const toollessText = await collectAgentStream({
          runId,
          role,
          productIdea,
          transcript,
          roster,
          templateId,
          config: toollessConfig,
          debateContext,
          usageAccumulator,
          abortSignal,
          send,
          disableTools: true,
          supplementalUserPrompt: buildArchitectToollessRetryUserPrompt(),
        });
        if (toollessText.trim()) {
          fullText = toollessText;
          fullText = await continueAgentStreamIfTruncated({
            runId,
            role,
            productIdea,
            transcript,
            roster,
            templateId,
            config: toollessConfig,
            debateContext,
            usageAccumulator,
            abortSignal,
            send,
            fullText,
          });
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error(
        `${member.name} (${role}) returned no output — check API limits or retry.`,
      );
    }

    const persisted = normalizeAgentPersistedText(role, fullText);
    if (!persisted.trim()) {
      throw new Error(
        `${member.name} (${role}) returned no visible output after normalization.`,
      );
    }
  } finally {
    send({ type: "agent_end", role });
  }

  return fullText.trim();
}

async function continueAgentStreamIfTruncated({
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
  fullText,
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
  fullText: string;
}): Promise<string> {
  let merged = fullText.trim();
  if (!looksLikeTruncatedAgentOutput(merged, role)) {
    return merged;
  }

  assertNotAborted(abortSignal);
  console.warn(`${role}: output looks truncated, requesting continuation`);

  const continuation = await collectAgentStream({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: {
      ...config,
      maxOutputTokens: TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS,
    },
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    continuationOf: merged,
  });

  if (continuation.trim()) {
    merged = `${merged}${continuation.trimStart()}`;
  }

  if (looksLikeTruncatedAgentOutput(merged, role)) {
    console.warn(`${role}: still truncated after continuation, second pass`);
    const second = await collectAgentStream({
      runId,
      role,
      productIdea,
      transcript,
      roster,
      templateId,
      config: {
        ...config,
        maxOutputTokens: TRUNCATION_CONTINUATION_MAX_OUTPUT_TOKENS,
      },
      debateContext,
      usageAccumulator,
      abortSignal,
      send,
      continuationOf: merged,
    });
    if (second.trim()) {
      merged = `${merged}${second.trimStart()}`;
    }
  }

  return merged;
}
