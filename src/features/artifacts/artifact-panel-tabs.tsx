"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import { GenerateBlueprintButton } from "@/features/artifacts/generate-blueprint-button";
import {
  ARTIFACT_TAB_LIST_CLASS,
  ARTIFACT_TAB_TRIGGER_BASE,
  getArtifactTabConfig,
} from "@/features/artifacts/artifact-tab-styles";
import type {
  ArtifactsPanelStatus,
  PartialRunArtifacts,
} from "@/features/artifacts/types";
import { cn } from "@/lib/utils";

type ArtifactTab = ReturnType<typeof getArtifactTabConfig>[number];

interface ArtifactPanelTabsProps {
  readonly artifactTabs: readonly ArtifactTab[];
  readonly panelArtifacts: PartialRunArtifacts | null;
  readonly regenerateRunId?: string;
  readonly status: ArtifactsPanelStatus;
  readonly onBlueprintGenerated: (
    generated: PartialRunArtifacts,
    validationFlags?: {
      stackValidationFailed: boolean;
      crossValidationFailed: boolean;
    },
  ) => void;
}

function renderTabContent(params: {
  readonly tab: ArtifactTab;
  readonly panelArtifacts: PartialRunArtifacts | null;
  readonly regenerateRunId?: string;
  readonly status: ArtifactsPanelStatus;
  readonly onBlueprintGenerated: ArtifactPanelTabsProps["onBlueprintGenerated"];
}) {
  const sections = params.panelArtifacts?.[params.tab.value];
  if (sections) {
    return <ArtifactSections sections={sections} />;
  }

  if (
    params.tab.value === "blueprint" &&
    params.regenerateRunId &&
    params.status === "ready"
  ) {
    return (
      <GenerateBlueprintButton
        runId={params.regenerateRunId}
        onGenerated={params.onBlueprintGenerated}
      />
    );
  }

  return <ArtifactPanelSkeleton />;
}

export function ArtifactPanelTabs({
  artifactTabs,
  panelArtifacts,
  regenerateRunId,
  status,
  onBlueprintGenerated,
}: ArtifactPanelTabsProps) {
  return (
    <Tabs
      defaultValue="requirements"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
    >
      <div className="relative z-10 min-w-0 shrink-0 bg-glass-bg px-4 pt-3 @max-sm/artifact-panel:pb-3">
        <TabsList className={cn(ARTIFACT_TAB_LIST_CLASS, "h-auto w-full")}>
          {artifactTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              title={tab.label}
              className={cn(ARTIFACT_TAB_TRIGGER_BASE, tab.triggerClass)}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {artifactTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="artifact-tab-content m-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
          >
            {renderTabContent({
              tab,
              panelArtifacts,
              regenerateRunId,
              status,
              onBlueprintGenerated,
            })}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
