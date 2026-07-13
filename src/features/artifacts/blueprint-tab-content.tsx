"use client";

import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { GenerateBlueprintButton } from "@/features/artifacts/generate-blueprint-button";
import type { PartialRunArtifacts } from "@/features/artifacts/types";

interface BlueprintTabContentProps {
  runId: string;
  sections?: PartialRunArtifacts["blueprint"];
}

export function BlueprintTabContent({ runId, sections }: BlueprintTabContentProps) {
  if (sections) {
    return <ArtifactSections sections={sections} />;
  }

  return (
    <GenerateBlueprintButton
      runId={runId}
      onGenerated={() => {
        window.location.reload();
      }}
    />
  );
}
