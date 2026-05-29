import { z } from "zod";

import type { TeamTemplateId } from "@/ai/agents/team-templates";
import { isTeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";

const agentRoleSchema = z.enum([
  "pm",
  "architect",
  "frontend",
  "backend",
  "reviewer",
  "devops",
]);

const runStatusSchema = z.enum(["idle", "running", "complete", "failed"]);

const debateOutcomeSchema = z.enum([
  "approved",
  "cap_reached",
  "unknown_reject_fallback",
]);

const artifactSectionSchema = z.object({
  title: z.string(),
  items: z.array(z.string()),
});

const partialArtifactsSchema = z
  .object({
    requirements: z.array(artifactSectionSchema).optional(),
    architecture: z.array(artifactSectionSchema).optional(),
    implementation: z.array(artifactSectionSchema).optional(),
    review: z.array(artifactSectionSchema).optional(),
  })
  .nullable()
  .optional();

const simulationMessageSchema = z.object({
  id: z.string(),
  role: agentRoleSchema,
  content: z.string(),
  agentName: z.string().optional(),
  agentTitle: z.string().optional(),
  createdAt: z.string().optional(),
});

const mockRunSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  userPrompt: z.string(),
  status: runStatusSchema,
  updatedAt: z.string(),
  messages: z.array(simulationMessageSchema).min(1),
  artifacts: partialArtifactsSchema,
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
      estimatedCostUsd: z.number(),
    })
    .optional(),
  debateOutcome: debateOutcomeSchema.nullable().optional(),
});

export const exportPdfPostBodySchema = z.object({
  run: mockRunSchema,
  templateId: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || isTeamTemplateId(value),
      "Invalid templateId",
    ),
});

export type ExportPdfPostBody = z.infer<typeof exportPdfPostBodySchema>;

export function toRunExportContext(
  body: ExportPdfPostBody,
): { run: MockRun; templateId?: TeamTemplateId } {
  return {
    run: body.run as MockRun,
    templateId: body.templateId as TeamTemplateId | undefined,
  };
}
