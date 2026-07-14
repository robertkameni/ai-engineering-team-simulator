import {
  MAX_TRUNCATION_CONTINUATIONS,
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
  isFrontendDeliverableInsufficient,
  isRoleDeliverableInsufficient,
  buildFrontendInsufficientContinuationPrompt,
  buildRoleInsufficientContinuationPrompt,
} from "@/ai/orchestration/agent-deliverable-quality";
import { normalizeAgentPersistedText } from "@/ai/orchestration/agent-stream-text";
import {
  buildTruncationContinuationPrompt,
  looksLikeTruncatedAgentOutput,
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import { buildArchitectToollessRetryUserPrompt } from "@/ai/prompts/architect";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import type { AgentStreamRetryParams } from "@/ai/orchestration/stream-agent-turn.types";

import { assertNotAborted } from "./simulation-abort";
import { collectAgentStream } from "./collect-agent-stream";

export interface StreamAgentTurnResult {
  text: string;
  /** TRUNCATION HANDLING FAILURE GUARD — true if the final output
   *  still appears truncated after all continuation/retry attempts. */
  wasTruncated: boolean;
}

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
}): Promise<StreamAgentTurnResult> {
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

    if (role === "frontend") {
      const normalizedFrontend = normalizeAgentPersistedText(role, fullText);
      if (isFrontendDeliverableInsufficient(normalizedFrontend)) {
        assertNotAborted(abortSignal);
        console.warn(`${role}: deliverable incomplete, requesting completion stream`);
        const completionConfig = {
          ...config,
          maxOutputTokens: Math.max(config.maxOutputTokens, 2600),
        };
        const completionText = await collectAgentStream({
          runId,
          role,
          productIdea,
          transcript,
          roster,
          templateId,
          config: completionConfig,
          debateContext,
          usageAccumulator,
          abortSignal,
          send,
          continuationOf: normalizedFrontend,
          supplementalUserPrompt: buildFrontendInsufficientContinuationPrompt(),
        });
        if (completionText.trim()) {
          fullText = `${normalizedFrontend}${completionText.trimStart()}`;
          fullText = await continueAgentStreamIfTruncated({
            runId,
            role,
            productIdea,
            transcript,
            roster,
            templateId,
            config: completionConfig,
            debateContext,
            usageAccumulator,
            abortSignal,
            send,
            fullText,
          });
        }
      }
    }

    fullText = await retryRoleDeliverableIfNeeded({
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

  // TRUNCATION HANDLING FAILURE GUARD
  const trimmedText = fullText.trim();
  const wasTruncated = looksLikeTruncatedAgentOutput(
    normalizeAgentPersistedText(role, trimmedText),
    role,
  );

  if (wasTruncated) {
    console.warn(
      `${role}: final output still appears truncated after all continuation attempts — marking turn as incomplete`,
      { runId, role, textLength: trimmedText.length },
    );
  }

  return { text: trimmedText, wasTruncated };
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

  for (
    let continuationIndex = 0;
    continuationIndex < MAX_TRUNCATION_CONTINUATIONS;
    continuationIndex += 1
  ) {
    if (!looksLikeTruncatedAgentOutput(merged, role)) {
      return merged;
    }

    assertNotAborted(abortSignal);
    console.warn(`${role}: output looks truncated, requesting continuation`, {
      continuationIndex: continuationIndex + 1,
      maxContinuations: MAX_TRUNCATION_CONTINUATIONS,
    });

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
  }

  return retryAfterTruncationExhausted({
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
    fullText: merged,
  });
}

async function retryAfterTruncationExhausted(
  params: AgentStreamRetryParams,
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
    fullText,
  } = params;

  const normalized = normalizeAgentPersistedText(role, fullText.trim());
  if (!looksLikeTruncatedAgentOutput(normalized, role)) {
    return normalized;
  }

  assertNotAborted(abortSignal);
  console.warn(`${role}: still truncated after continuations, requesting boosted completion`);

  const boostedConfig = {
    ...config,
    model: "deepseek-v4-flash" as const,
    maxOutputTokens: Math.max(config.maxOutputTokens * 1.5, 2400),
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  };

  const completionText = await collectAgentStream({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: boostedConfig,
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    continuationOf: normalized,
    supplementalUserPrompt: buildTruncationContinuationPrompt(normalized),
  });

  if (!completionText.trim()) {
    return normalized;
  }

  return `${normalized}${completionText.trimStart()}`;
}

async function retryRoleDeliverableIfNeeded(
  params: AgentStreamRetryParams,
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
    fullText,
  } = params;

  if (role !== "pm" && role !== "backend" && role !== "devops" && role !== "architect") {
    return fullText;
  }

  const normalized = normalizeAgentPersistedText(role, fullText);
  if (!isRoleDeliverableInsufficient(role, normalized, templateId)) {
    return fullText;
  }

  const supplementalUserPrompt = buildRoleInsufficientContinuationPrompt(role);
  if (!supplementalUserPrompt) {
    return fullText;
  }

  assertNotAborted(abortSignal);
  console.warn(`${role}: deliverable incomplete, requesting completion stream`);

  const completionConfig = {
    ...config,
    maxOutputTokens: Math.max(config.maxOutputTokens, 2400),
  };

  const completionText = await collectAgentStream({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: completionConfig,
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    continuationOf: normalized,
    supplementalUserPrompt,
  });

  if (!completionText.trim()) {
    return fullText;
  }

  const merged = `${normalized}${completionText.trimStart()}`;
  return continueAgentStreamIfTruncated({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: completionConfig,
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    fullText: merged,
  });
}
