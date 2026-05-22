"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArtifactSections } from "@/features/artifacts/artifact-sections";
import { ArtifactPanelPlaceholder } from "@/features/artifacts/artifact-panel-placeholder";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  ARTIFACT_TAB_CONFIG,
  ARTIFACT_TAB_LIST_CLASS,
  ARTIFACT_TAB_TRIGGER_BASE,
} from "@/features/artifacts/artifact-tab-styles";
import {
  artifactPanelSubtitle,
  type DebateProgress,
} from "@/features/artifacts/artifact-panel-phase";
import type {
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";
import type { AgentRole } from "@/features/agents/types";
import { cn } from "@/lib/utils";

interface ArtifactPanelProps {
  artifacts?: RunArtifacts | null;
  status?: ArtifactsPanelStatus;
  layout?: "inline" | "sheet";
  regenerateRunId?: string;
  canRegenerateArtifacts?: boolean;
  debateProgress?: DebateProgress;
  debateMessages?: { role: AgentRole; isStreaming?: boolean }[];
  activeAgent?: AgentRole | null;
}

export function ArtifactPanel({
  artifacts = null,
  status = "idle",
  layout = "inline",
  regenerateRunId,
  canRegenerateArtifacts = false,
  debateProgress,
  debateMessages,
  activeAgent = null,
}: ArtifactPanelProps) {
  const isReady = status === "ready" && artifacts != null;
  const isSheet = layout === "sheet";
  const showRegenerate = canRegenerateArtifacts && regenerateRunId != null;
  const subtitle = artifactPanelSubtitle(status, debateProgress);

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel flex min-h-0 shrink-0 flex-col overflow-x-hidden",
        isSheet
          ? "h-full w-full max-h-none border-0"
          : "hidden h-full max-h-none w-[min(100%,420px)] border-l border-glass-border min-[960px]:flex",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
          <p className="mt-0.5 text-caption text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showRegenerate ? (
            <RegenerateArtifactsButton
              runId={regenerateRunId}
              disabled={status === "generating" || status === "pending"}
            />
          ) : null}
          {isSheet ? (
            <SheetClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="glass-card size-8 border-glass-border"
                aria-label="Close artifacts"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          ) : null}
        </div>
      </header>

      {isReady ? (
        <Tabs
          defaultValue="requirements"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-w-0 shrink-0 px-4 pt-3 @max-sm/artifact-panel:pb-3">
            <TabsList className={ARTIFACT_TAB_LIST_CLASS}>
              {ARTIFACT_TAB_CONFIG.map((tab) => (
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

          {ARTIFACT_TAB_CONFIG.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="artifact-tab-content mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <ScrollArea
                className={cn(
                  "px-4",
                  isSheet
                    ? "h-[calc(100%-1px)] max-h-[calc(88svh-7rem)]"
                    : "h-[calc(100svh-7.5rem)]",
                )}
              >
                <ArtifactSections sections={artifacts[tab.value]} />
              </ScrollArea>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <ArtifactPanelPlaceholder
          status={status}
          regenerateRunId={regenerateRunId}
          canRegenerateArtifacts={canRegenerateArtifacts}
          debateProgress={debateProgress}
          debateMessages={debateMessages}
          activeAgent={activeAgent}
        />
      )}
    </aside>
  );
}
