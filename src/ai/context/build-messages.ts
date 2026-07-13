import type { ModelMessage } from "ai";

import type { SimulationAgentRole } from "@/ai/agents/config";
import { getTeamMember, type TeamRoster } from "@/ai/agents/roster";
import { buildLanguageMatchDirective } from "@/ai/context/detect-product-language";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { windowTranscriptForTurn } from "@/ai/context/window-transcript";
import { getAgentTurnPrompt } from "@/ai/prompts";
import type { AgentRole } from "@/features/agents/types";

export interface DebateTurnContext {
  correction?: {
    reviewerName: string;
    feedback: string;
    targetRole: SimulationAgentRole;
  };
  isReReview?: boolean;
  hasTeamDisagreement?: boolean;
  architectRevisionCritiques?: string[];
}

function formatProductIdeaBlock(productIdea: string): string {
  return `## Product idea\n\n${productIdea}\n\n${buildLanguageMatchDirective(productIdea)}`;
}

export function resolveDebateTurnContext(
  role: SimulationAgentRole,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  lastRejectTarget: SimulationAgentRole | null,
  lastRejectFeedback: string | null,
): DebateTurnContext {
  const reviewerName = getTeamMember(roster, "reviewer").name;

  if (
    role === lastRejectTarget &&
    lastRejectFeedback &&
    transcript.length > 0 &&
    transcript[transcript.length - 1]?.role === "reviewer"
  ) {
    return {
      correction: {
        reviewerName,
        feedback: lastRejectFeedback,
        targetRole: role,
      },
    };
  }

  if (
    role === "reviewer" &&
    lastRejectTarget &&
    lastRejectFeedback &&
    transcript.length > 0 &&
    transcript[transcript.length - 1]?.role === lastRejectTarget
  ) {
    return { isReReview: true };
  }

  return {};
}

export function buildAgentMessages(
  role: AgentRole,
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
  debateContext: DebateTurnContext = {},
): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: formatProductIdeaBlock(productIdea),
    },
  ];

  const windowedTranscript = windowTranscriptForTurn(
    transcript,
    roster,
    debateContext,
  );

  if (windowedTranscript.omittedSummary) {
    messages.push({
      role: "user",
      content: windowedTranscript.omittedSummary,
    });
  }

  for (const entry of windowedTranscript.entries) {
    const teammateTitle = getTeamMember(roster, entry.role).title;
    messages.push({
      role: "user",
      content: `[MESSAGE FROM TEAMMATE ${entry.agentName} (${teammateTitle})]:\n\n${formatTranscriptMessage(entry)}`,
    });
  }

  messages.push({
    role: "user",
    content: getAgentTurnPrompt(
      role,
      productIdea,
      roster,
      roster.templateId,
      debateContext,
    ),
  });

  return messages;
}

function formatTranscriptMessage(entry: TranscriptEntry): string {
  return `**${entry.agentName}** (${entry.role}):\n\n${entry.content}`;
}
