import type { ModelMessage } from "ai";

import type { TeamRoster } from "@/ai/agents/roster";
import { buildLanguageMatchDirective } from "@/ai/context/detect-product-language";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getAgentTurnPrompt } from "@/ai/prompts";
import type { AgentRole } from "@/features/agents/types";

function formatProductIdeaBlock(productIdea: string): string {
  return `## Product idea\n\n${productIdea}\n\n${buildLanguageMatchDirective(productIdea)}`;
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

  const isCorrection =
    transcript.length > 0 &&
    transcript[transcript.length - 1].role === "reviewer";

  messages.push({
    role: "user",
    content: getAgentTurnPrompt(
      role,
      productIdea,
      roster,
      roster.templateId,
      isCorrection,
    ),
  });

  return messages;
}

function formatTranscriptMessage(entry: TranscriptEntry): string {
  return `**${entry.agentName}** (${entry.role}):\n\n${entry.content}`;
}
