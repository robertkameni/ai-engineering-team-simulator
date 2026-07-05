import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { ArtifactType } from "@/features/artifacts/schemas";

const SOFTWARE_ARTIFACT_SECTION_GUIDELINES: Record<ArtifactType, string> = {
  requirements:
    "Overview, users & problem, features (v1), user stories, out of scope, success metrics",
  architecture:
    "Overview, system design, data model, APIs & integrations, decisions & risks",
  implementation:
    "Stack, backend, frontend, testing & rollout, delivery risks",
  blueprint:
    "Dependencies (with versions), Directory Structure, API Endpoints, Database Schema, Environment Config, Key Interfaces",
  review: "Summary, agreements & disputes, risks, recommendations",
};

const PHYSICAL_ARTIFACT_SECTION_GUIDELINES: Record<ArtifactType, string> = {
  requirements:
    "Work scope & objectives, users & stakeholders, site context, key deliverables, out of scope, success metrics",
  architecture:
    "Technical overview, site/system design, materials & equipment, regulatory compliance, decisions & risks",
  implementation:
    "Execution plan, phasing & schedule, budget scenarios, resources & contractors, delivery risks",
  blueprint:
    "Materials & Vendors (with specifications), Site Layout, Equipment List, Compliance Checklist, Budget Line Items, Key Specs",
  review: "Summary, agreements & disputes, risks, recommendations",
};

export function sectionGuidelinesForArtifact(
  type: ArtifactType,
  templateId: TeamTemplateId = "software",
): string {
  const guidelines =
    templateId === "physical"
      ? PHYSICAL_ARTIFACT_SECTION_GUIDELINES
      : SOFTWARE_ARTIFACT_SECTION_GUIDELINES;
  return guidelines[type];
}
