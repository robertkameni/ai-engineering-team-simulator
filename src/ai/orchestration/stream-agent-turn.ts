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
  buildDeepFocusContinuationPrompt,
  evaluateDeepFocusTurn,
  mergeDeepFocusTagContinuation,
  needsDeepFocusTagRetry,
} from "@/ai/orchestration/deep-focus-gate";
import {
  buildTruncationContinuationPrompt,
  isWorthlessContinuation,
  looksLikeTruncatedAgentOutput,
  mergeContinuationText,
} from "@/ai/orchestration/looks-like-truncated-agent-output";
import { buildArchitectToollessRetryUserPrompt } from "@/ai/prompts/architect";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { RunUsageAccumulator } from "@/lib/ai/run-usage-accumulator";
import type { SimulationStreamEvent } from "@/lib/simulation-stream";

import type {
  AgentStreamRetryParams,
} from "@/ai/orchestration/stream-agent-turn.types";

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
  const streamParams = {
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
  };

  send({
    type: "agent_start",
    role,
    name: member.name,
    title: member.title,
  });

  let fullText: string;
  try {
    fullText = await collectAgentStream({
      ...streamParams,
      config,
      disableTools,
    });

    fullText = await retryEmptyStreamIfNeeded({
      ...streamParams,
      config,
      fullText,
    });

    fullText = await continueAgentStreamIfTruncated({
      ...streamParams,
      config,
      fullText,
    });

    fullText = await retryArchitectQualityIfNeeded({
      ...streamParams,
      config,
      fullText,
    });

    fullText = await retryFrontendQualityIfNeeded({
      ...streamParams,
      config,
      fullText,
    });

    fullText = await retryRoleDeliverableIfNeeded({
      ...streamParams,
      config,
      fullText,
    });

    fullText = await retryDeepFocusTagsIfNeeded({
      ...streamParams,
      config,
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

  const trimmedText = fullText.trim();
  const wasTruncated = looksLikeTruncatedAgentOutput(
    normalizeAgentPersistedText(role, trimmedText),
    role,
    { templateId },
  );

  if (wasTruncated) {
    console.warn(
      `${role}: final output still appears truncated after all continuation attempts — marking turn as incomplete`,
      { runId, role, textLength: trimmedText.length },
    );
  }

  return { text: trimmedText, wasTruncated };
}

async function retryEmptyStreamIfNeeded(
  params: AgentStreamRetryParams,
): Promise<string> {
  if (params.fullText.trim()) {
    return params.fullText;
  }

  assertNotAborted(params.abortSignal);
  console.warn(
    `${params.role}: empty stream, retrying with chat model (no reasoning)`,
  );

  const retryConfig = {
    ...params.config,
    model: "deepseek-v4-flash" as const,
    maxOutputTokens: Math.max(params.config.maxOutputTokens * 1.5, 2400),
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  };

  const retried = await collectAgentStream({
    ...params,
    config: retryConfig,
  });

  return continueAgentStreamIfTruncated({
    ...params,
    config: retryConfig,
    fullText: retried,
  });
}

async function retryArchitectQualityIfNeeded(
  params: AgentStreamRetryParams,
): Promise<string> {
  if (params.role !== "architect" || params.templateId === "physical") {
    return params.fullText;
  }

  const normalized = normalizeAgentPersistedText(params.role, params.fullText);
  if (!isArchitectDeliverableInsufficient(normalized, params.templateId)) {
    return params.fullText;
  }

  assertNotAborted(params.abortSignal);
  console.warn(
    `${params.role}: insufficient sections after tool turn, retrying without tools`,
  );

  const toollessConfig = {
    ...params.config,
    model: "deepseek-v4-flash" as const,
    maxOutputTokens: Math.max(params.config.maxOutputTokens, 3200),
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  };

  const toollessText = await collectAgentStream({
    ...params,
    config: toollessConfig,
    disableTools: true,
    supplementalUserPrompt: buildArchitectToollessRetryUserPrompt(),
  });

  if (!toollessText.trim()) {
    return params.fullText;
  }

  return continueAgentStreamIfTruncated({
    ...params,
    config: toollessConfig,
    fullText: toollessText,
  });
}

async function retryFrontendQualityIfNeeded(
  params: AgentStreamRetryParams,
): Promise<string> {
  if (params.role !== "frontend" || params.templateId === "physical") {
    return params.fullText;
  }

  const normalizedFrontend = normalizeAgentPersistedText(
    params.role,
    params.fullText,
  );
  if (!isFrontendDeliverableInsufficient(normalizedFrontend, params.templateId)) {
    return params.fullText;
  }

  assertNotAborted(params.abortSignal);
  console.warn(
    `${params.role}: deliverable incomplete, requesting completion stream`,
  );

  const completionConfig = {
    ...params.config,
    maxOutputTokens: Math.max(params.config.maxOutputTokens, 2600),
  };

  const completionText = await collectAgentStream({
    ...params,
    config: completionConfig,
    continuationOf: normalizedFrontend,
    supplementalUserPrompt: buildFrontendInsufficientContinuationPrompt(),
  });

  if (!completionText.trim()) {
    return params.fullText;
  }

  return continueAgentStreamIfTruncated({
    ...params,
    config: completionConfig,
    fullText: mergeContinuationText(normalizedFrontend, completionText),
  });
}

async function continueAgentStreamIfTruncated(
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
  let merged = fullText.trim();

  for (
    let continuationIndex = 0;
    continuationIndex < MAX_TRUNCATION_CONTINUATIONS;
    continuationIndex += 1
  ) {
    if (!looksLikeTruncatedAgentOutput(merged, role, { templateId })) {
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

    if (!continuation.trim() || isWorthlessContinuation(continuation)) {
      console.info(`${role}: skipping worthless continuation (meta/duplicate tags)`, {
        continuationIndex: continuationIndex + 1,
      });
      return merged;
    }

    merged = mergeContinuationText(merged, continuation);
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
  if (!looksLikeTruncatedAgentOutput(normalized, role, { templateId })) {
    return normalized;
  }

  assertNotAborted(abortSignal);
  console.warn(`${role}: still truncated after continuations, requesting full brevity rewrite`);

  const rewriteConfig = {
    ...config,
    model: "deepseek-v4-flash" as const,
    maxOutputTokens: Math.min(config.maxOutputTokens, 1400),
    deepseek: DEEPSEEK_CHAT_OPTIONS,
  };

  const rewriteText = await collectAgentStream({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: rewriteConfig,
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    supplementalUserPrompt: `FULL REWRITE — previous output truncated. Produce a COMPLETE replacement under 350 words covering the same required sections. Do not continue mid-sentence. Close cleanly.`,
  });

  if (!rewriteText.trim()) {
    return normalized;
  }

  return normalizeAgentPersistedText(role, rewriteText.trim());
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

  const merged = mergeContinuationText(normalized, completionText);
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

async function retryDeepFocusTagsIfNeeded(
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

  const evaluation = evaluateDeepFocusTurn({
    role,
    text: fullText,
    transcript,
    roster,
    isCorrection: Boolean(debateContext?.correction),
  });
  if (!needsDeepFocusTagRetry(evaluation.violations)) {
    return fullText;
  }

  const supplementalUserPrompt = buildDeepFocusContinuationPrompt(
    evaluation.violations,
  );
  if (!supplementalUserPrompt) {
    return fullText;
  }

  assertNotAborted(abortSignal);
  console.warn(`${role}: DeepFocus tags missing, requesting tag continuation`, {
    runId,
    violations: evaluation.violations,
  });

  const completionText = await collectAgentStream({
    runId,
    role,
    productIdea,
    transcript,
    roster,
    templateId,
    config: {
      ...config,
      maxOutputTokens: Math.min(config.maxOutputTokens, 400),
    },
    debateContext,
    usageAccumulator,
    abortSignal,
    send,
    continuationOf: fullText,
    supplementalUserPrompt,
  });

  if (!completionText.trim() || isWorthlessContinuation(completionText)) {
    return fullText;
  }

  return mergeDeepFocusTagContinuation(fullText, completionText, roster);
}
