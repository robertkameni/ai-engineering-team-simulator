import { generateText, Output } from "ai";

import { sectionTitlesForArtifact } from "@/ai/artifacts/artifact-templates";
import { buildTranscriptForArtifacts } from "@/ai/artifacts/build-transcript";
import type { TeamRoster } from "@/ai/agents/roster";
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

const ARTIFACT_FOCUS: Record<ArtifactType, string> = {
  requirements:
    "Product scope, users, v1 features, user stories, exclusions, measurable success criteria.",
  architecture:
    "Components, data entities, APIs/events, auth, background jobs, and technical risks.",
  implementation:
    "Backend and frontend stacks, key modules, testing approach, and rollout plan.",
  review:
    "Where the team agreed, key disagreements, top risks, and prioritized recommendations.",
};

async function generateArtifactDocument(
  type: ArtifactType,
  transcriptPrompt: string,
): Promise<ArtifactDocument> {
  const sectionList = sectionTitlesForArtifact(type);

  const system = `You are a technical writer producing the "${type}" deliverable from an engineering team debate.

Focus: ${ARTIFACT_FOCUS[type]}

Output rules:
- Use exactly these section titles (one section each, in order):
${sectionList}
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
      maxOutputTokens: 1400,
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
    maxOutputTokens: 1400,
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
}: {
  productIdea: string;
  transcript: TranscriptEntry[];
  roster: TeamRoster;
}): Promise<RunArtifactsOutput> {
  const transcriptPrompt = buildTranscriptForArtifacts(
    productIdea,
    transcript,
    roster,
  );

  const output = {} as RunArtifactsOutput;

  for (const type of ARTIFACT_TYPES) {
    const document = await generateArtifactDocument(type, transcriptPrompt);
    output[type] = document;
  }

  return output;
}
