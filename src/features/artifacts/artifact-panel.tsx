import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArtifactPanelSkeleton } from "@/features/artifacts/artifact-panel-skeleton";
import {
  normalizeArtifactItem,
  normalizeArtifactTitle,
} from "@/features/artifacts/format-artifact";
import { RegenerateArtifactsButton } from "@/features/artifacts/regenerate-artifacts-button";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  ARTIFACT_TAB_CONFIG,
  ARTIFACT_TAB_LIST_CLASS,
  ARTIFACT_TAB_TRIGGER_BASE,
} from "@/features/artifacts/artifact-tab-styles";
import type {
  ArtifactSectionGroup,
  ArtifactsPanelStatus,
  RunArtifacts,
} from "@/features/artifacts/types";
import { cn } from "@/lib/utils";

function ArtifactSections({ sections }: { sections: ArtifactSectionGroup[] }) {
  if (sections.length === 0) {
    return (
      <p className="text-body text-muted-foreground">No sections extracted.</p>
    );
  }

  return (
    <section className="flex flex-col gap-4 pb-6">
      {sections.map((section, index) => {
        const title = normalizeArtifactTitle(section.title);
        const items = section.items
          .map(normalizeArtifactItem)
          .filter((item) => item.length > 0);

        if (items.length === 0) return null;

        return (
          <section
            key={title}
            className="glass-card rounded-xl px-3 py-3 message-enter"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <h3 className="mb-2.5 text-caption font-semibold tracking-wider text-foreground uppercase">
              {title}
            </h3>
            <ul className="list-disc space-y-1.5 pl-4 marker:text-muted-foreground/60">
              {items.map((item) => (
                <li
                  key={`${title}-${item}`}
                  className="text-body leading-snug text-foreground/90"
                >
                  {item}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

function ArtifactPlaceholder({
  status,
  onRegenerateArtifacts,
  canRegenerateArtifacts,
  isRegeneratingArtifacts,
}: {
  status: ArtifactsPanelStatus;
  onRegenerateArtifacts?: () => void | Promise<void>;
  canRegenerateArtifacts?: boolean;
  isRegeneratingArtifacts?: boolean;
}) {
  const copy =
    status === "generating"
      ? "Synthesizing structured deliverables from the debate…"
      : status === "pending"
        ? "The team is debating — structured artifacts will generate when they finish."
        : status === "unavailable"
          ? "Artifacts could not be generated for this run. Regenerate from the saved debate or start a new simulation."
          : "Start a simulation to generate requirements, architecture, implementation, and review.";

  if (status === "generating") {
    return <ArtifactPanelSkeleton />;
  }

  return (
    <section className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
      {status === "pending" ? (
        <span className="pulse-glow mb-3 size-2.5 rounded-full bg-agent-architect" />
      ) : null}
      <p className="text-body text-muted-foreground">{copy}</p>
      {status === "unavailable" &&
      canRegenerateArtifacts &&
      onRegenerateArtifacts ? (
        <RegenerateArtifactsButton
          variant="placeholder"
          onRegenerate={onRegenerateArtifacts}
          loading={isRegeneratingArtifacts}
        />
      ) : null}
    </section>
  );
}

interface ArtifactPanelProps {
  artifacts?: RunArtifacts | null;
  status?: ArtifactsPanelStatus;
  layout?: "inline" | "sheet";
  onRegenerateArtifacts?: () => void | Promise<void>;
  canRegenerateArtifacts?: boolean;
  isRegeneratingArtifacts?: boolean;
}

export function ArtifactPanel({
  artifacts = null,
  status = "idle",
  layout = "inline",
  onRegenerateArtifacts,
  canRegenerateArtifacts = false,
  isRegeneratingArtifacts = false,
}: ArtifactPanelProps) {
  const isReady = status === "ready" && artifacts != null;
  const isSheet = layout === "sheet";
  const showRegenerate =
    canRegenerateArtifacts && onRegenerateArtifacts != null;

  return (
    <aside
      className={cn(
        "@container/artifact-panel glass-panel flex min-h-0 shrink-0 flex-col overflow-x-hidden",
        isSheet
          ? "h-full w-full max-h-none border-0"
          : "hidden h-full max-h-none w-[min(100%,420px)] border-l border-glass-border @[960px]/app-shell:flex",
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-glass-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-title font-semibold tracking-tight">Artifacts</h2>
          <p
            className={cn(
              "mt-0.5 text-caption text-muted-foreground",
              isSheet ? "block" : "hidden @[720px]/artifact-panel:block",
            )}
          >
            Structured outputs from the team
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showRegenerate ? (
            <RegenerateArtifactsButton
              onRegenerate={onRegenerateArtifacts}
              loading={isRegeneratingArtifacts}
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
        <ArtifactPlaceholder
          status={status}
          onRegenerateArtifacts={onRegenerateArtifacts}
          canRegenerateArtifacts={canRegenerateArtifacts}
          isRegeneratingArtifacts={isRegeneratingArtifacts}
        />
      )}
    </aside>
  );
}
