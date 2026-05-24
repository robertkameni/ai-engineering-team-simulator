import type { ModelMessage } from "ai";

import type { TeamRoster } from "@/ai/agents/roster";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getAgentTurnPrompt } from "@/ai/prompts";
import type { AgentRole } from "@/features/agents/types";

const LANGUAGE_MATCH_DIRECTIVE =
  "CRITICAL: You MUST detect the language of the Product Idea. Your entire response, including all section headings and technical terms, MUST be written in that same language.";

function formatProductIdeaBlock(productIdea: string): string {
  return `## Product idea\n\n${productIdea}\n\n${LANGUAGE_MATCH_DIRECTIVE}`;
}

export function buildAgentMessages(
  role: AgentRole,
  productIdea: string,
  transcript: TranscriptEntry[],
  roster: TeamRoster,
): ModelMessage[] {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: formatProductIdeaBlock(productIdea),
    },
  ];

  for (const entry of transcript) {
    messages.push({
      role: "assistant",
      content: formatTranscriptMessage(entry),
    });
  }

  messages.push({
    role: "user",
    content: getAgentTurnPrompt(role, productIdea, roster, roster.templateId),
  });

  return messages;
}

function formatTranscriptMessage(entry: TranscriptEntry): string {
  return `**${entry.agentName}** (${entry.role}):\n\n${entry.content}`;
}
