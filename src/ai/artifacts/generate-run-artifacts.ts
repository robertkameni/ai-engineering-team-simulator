import { generateText, Output } from "ai";

import { sectionGuidelinesForArtifact } from "@/ai/artifacts/artifact-templates";
import { buildTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
import type { TeamRoster } from "@/ai/agents/roster";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { TranscriptEntry } from "@/ai/context/transcript";
import { getDeepSeekModel } from "@/ai/providers";
import { DEEPSEEK_CHAT_OPTIONS } from "@/ai/deepseek-options";
import {
  ARTIFACT_TYPES,
  type ArtifactDocument,
  type ArtifactType,
  artifactDocumentSchema,
  type RunArtifactsOutput,
} from "@/features/artifacts/schemas";

const ARTIFACT_LANGUAGE_DIRECTIVE =
  "Analyze the transcript to determine the primary language used by the agents. You MUST write this entire artifact, including all section titles, in that exact language.";

const SOFTWARE_ARTIFACT_FOCUS: Record<ArtifactType, string> = {
  requirements:
    "Product scope, users, v1 features, user stories, exclusions, measurable success criteria.",
  architecture:
    "Components, data entities, APIs/events, auth, background jobs, and technical risks.",
  implementation:
    "Backend and frontend stacks, key modules, testing approach, and rollout plan.",
  review:
    "Where the team agreed, key disagreements, top risks, and prioritized recommendations.",
};

const PHYSICAL_ARTIFACT_FOCUS: Record<ArtifactType, string> = {
  requirements:
    "Work scope, stakeholders, site context, key deliverables, exclusions, measurable success criteria.",
  architecture:
    "Technical design, materials, site constraints, regulatory compliance, and technical risks.",
  implementation:
    "Execution plan, phasing, budget scenarios, resources, contractors, and delivery risks.",
  review:
    "Where the team agreed, key disagreements, top risks, and prioritized recommendations.",
};

function artifactFocusForTemplate(
  type: ArtifactType,
  templateId: TeamTemplateId,
): string {
  const focus =
    templateId === "physical" ? PHYSICAL_ARTIFACT_FOCUS : SOFTWARE_ARTIFACT_FOCUS;
  return focus[type];
}

async function generateArtifactDocument(
  type: ArtifactType,
  transcriptPrompt: string,
  templateId: TeamTemplateId,
): Promise<ArtifactDocument> {
  const sectionGuidelines = sectionGuidelinesForArtifact(type, templateId);
  const focus = artifactFocusForTemplate(type, templateId);

  const system = `You are a technical writer producing the "${type}" deliverable from a team debate.

Focus: ${focus}

Output rules:
- The document must cover these topics (one section each, in a logical order): ${sectionGuidelines}
- Choose appropriate section titles in the transcript's primary language.
- ${ARTIFACT_LANGUAGE_DIRECTIVE}
- 3–5 concise bullets per section; each bullet is one complete sentence (max ~20 words).
- Write as a polished internal document — NOT meeting notes.
- Do NOT append speaker names to bullets (no "(Name)" suffixes).
- Synthesize consensus; note disagreement only in the review artifact.
- Omit sections with no substance from the debate.`;

  try {
    const structured = await generateText({
      model: getDeepSeekModel("deepseek-v4-flash"),
      system,
      prompt: transcriptPrompt,
      maxOutputTokens: 1200,
      temperature: 0.2,
      output: Output.object({ schema: artifactDocumentSchema }),
      providerOptions: {
        deepseek: DEEPSEEK_CHAT_OPTIONS,
      },
    });

    if (structured.output) {
      return structured.output;
    }
  } catch (error) {
    console.warn(`Structured ${type} artifact failed, trying JSON fallback:`, error);
  }

  const fallback = await generateText({
    model: getDeepSeekModel("deepseek-v4-flash"),
    system: `${system}

Respond with ONLY a JSON object: { "sections": [{ "title": string, "items": string[] }] }`,
    prompt: transcriptPrompt,
    maxOutputTokens: 1200,
    temperature: 0.2,
    providerOptions: {
      deepseek: DEEPSEEK_CHAT_OPTIONS,
    },
  });

  const json = extractJsonObject(fallback.text);
  const parsed = artifactDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Failed to parse ${type} artifact: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("No JSON object found in model response");
    }
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export async function generateRunArtifacts({
  productIdea,
  transcript,
  roster,
  onArtifactComplete,
}: {
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
  onArtifactComplete?: (
    type: ArtifactType,
    document: ArtifactDocument,
  ) => Promise<void> | void;
}): Promise<RunArtifactsOutput> {
  const templateId = roster.templateId;
  const transcriptPrompt = buildTranscriptForArtifacts(
    productIdea,
    transcript,
    roster,
  );

  const entries = await Promise.all(
    ARTIFACT_TYPES.map(async (type) => {
      const document = await generateArtifactDocument(
        type,
        transcriptPrompt,
        templateId,
      );
      await onArtifactComplete?.(type, document);
      return [type, document] as const;
    }),
  );

  return Object.fromEntries(entries) as RunArtifactsOutput;
}
