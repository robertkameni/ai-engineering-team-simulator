import { z } from "zod";

export {
  ARTIFACT_TYPES,
  isArtifactType,
  type ArtifactType,
} from "@/features/artifacts/artifact-constants";

const artifactSectionSchema = z.object({
  title: z.string().describe("Section heading"),
  items: z
    .array(z.string())
    .min(1)
    .describe("Concise bullet points for this section"),
});

export const artifactDocumentSchema = z.object({
  sections: z
    .array(artifactSectionSchema)
    .min(1)
    .max(8)
    .describe("Grouped sections for the artifact tab"),
});

const runArtifactsOutputSchema = z.object({
  requirements: artifactDocumentSchema.describe(
    "PM scope: features, stories, metrics, out of scope",
  ),
  architecture: artifactDocumentSchema.describe(
    "System design: stack, data model, APIs, realtime, risks",
  ),
  implementation: artifactDocumentSchema.describe(
    "Backend + frontend delivery: stack, modules, testing, rollout",
  ),
  blueprint: artifactDocumentSchema.describe(
    "Concrete build details: dependency versions, directory tree, API endpoints, DB schema, env config, key interfaces",
  ),
  review: artifactDocumentSchema.describe(
    "Reviewer: quoted concerns, risks, recommendations",
  ),
});

export type ArtifactSection = z.infer<typeof artifactSectionSchema>;
export type ArtifactDocument = z.infer<typeof artifactDocumentSchema>;
export type RunArtifactsOutput = z.infer<typeof runArtifactsOutputSchema>;
