import { generateText, Output } from "ai";
import { z } from "zod";

import {
  type TeamTemplateId,
  isTeamTemplateId,
} from "@/ai/agents/team-templates";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import { getDeepSeekModel } from "@/ai/providers";

const classificationSchema = z.object({
  templateId: z.enum(["software", "physical", "hybrid"]),
  domainHint: z.string(),
});

export interface ProjectClassification {
  templateId: TeamTemplateId;
  domainHint: string;
}

const DEFAULT_CLASSIFICATION: ProjectClassification = {
  templateId: "software",
  domainHint: "software product",
};

export async function classifyProjectTeamTemplate(
  productIdea: string,
): Promise<ProjectClassification> {
  try {
    const result = await generateText({
      model: getDeepSeekModel("deepseek-v4-flash"),
      system: `You classify project ideas to pick a simulation team template.

Templates:
- software: digital products (apps, SaaS, APIs, dashboards, web/mobile).
- physical: construction, renovation, infrastructure, field work, regulatory compliance — no software deliverable unless explicitly requested.
- hybrid: both a physical/construction scope AND a software product to support it.

Rules:
- Prefer physical when the core ask is works, building, infrastructure, or compliance without building an app.
- Prefer software when the core ask is building or designing a digital product.
- Use hybrid only when both are clearly required.
- Phrases like "sans logiciel" or "no software" strongly indicate physical.
- Respond in the same language as the product idea for domainHint (short phrase).`,
      prompt: productIdea,
      maxOutputTokens: 120,
      temperature: 0,
      output: Output.object({ schema: classificationSchema }),
      providerOptions: {
        deepseek: DEEPSEEK_CHAT_OPTIONS,
      },
    });

    if (result.output && isTeamTemplateId(result.output.templateId)) {
      return {
        templateId: result.output.templateId,
        domainHint: result.output.domainHint.trim() || DEFAULT_CLASSIFICATION.domainHint,
      };
    }
  } catch (error) {
    console.warn("Project classification failed, defaulting to software:", error);
  }

  return DEFAULT_CLASSIFICATION;
}
