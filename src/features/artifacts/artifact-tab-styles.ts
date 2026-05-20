import type { ArtifactType } from "@/features/artifacts/artifact-constants";
import { cn } from "@/lib/utils";

export const ARTIFACT_TAB_CONFIG: {
  value: ArtifactType;
  label: string;
  triggerClass: string;
}[] = [
  {
    value: "requirements",
    label: "Requirements",
    triggerClass: cn(
      "data-[state=active]:border-agent-pm/40 data-[state=active]:bg-agent-pm/12",
      "data-[state=active]:text-agent-pm data-[state=active]:shadow-[0_0_14px_-4px] data-[state=active]:shadow-agent-pm/50",
      "active:bg-agent-pm/20",
    ),
  },
  {
    value: "architecture",
    label: "Architecture",
    triggerClass: cn(
      "data-[state=active]:border-agent-architect/40 data-[state=active]:bg-agent-architect/12",
      "data-[state=active]:text-agent-architect data-[state=active]:shadow-[0_0_14px_-4px] data-[state=active]:shadow-agent-architect/50",
      "active:bg-agent-architect/20",
    ),
  },
  {
    value: "implementation",
    label: "Implementation",
    triggerClass: cn(
      "data-[state=active]:border-agent-backend/40 data-[state=active]:bg-agent-backend/12",
      "data-[state=active]:text-agent-backend data-[state=active]:shadow-[0_0_14px_-4px] data-[state=active]:shadow-agent-backend/50",
      "active:bg-agent-backend/20",
    ),
  },
  {
    value: "review",
    label: "Review",
    triggerClass: cn(
      "data-[state=active]:border-agent-reviewer/40 data-[state=active]:bg-agent-reviewer/12",
      "data-[state=active]:text-agent-reviewer data-[state=active]:shadow-[0_0_14px_-4px] data-[state=active]:shadow-agent-reviewer/50",
      "active:bg-agent-reviewer/20",
    ),
  },
];

export const ARTIFACT_TAB_LIST_CLASS = cn(
  "grid w-full min-w-0 grid-cols-4 gap-1 overflow-hidden rounded-lg border border-border/60 bg-surface-2/40 p-1",
  "@max-sm/artifact-panel:h-auto @max-sm/artifact-panel:grid-cols-2 @max-sm/artifact-panel:gap-4",
);

export const ARTIFACT_TAB_TRIGGER_BASE = cn(
  "relative flex-none grow-0 basis-auto",
  "w-full min-w-0 rounded-md border border-transparent px-1.5 py-1.5",
  "truncate text-center text-[10px] leading-tight font-medium whitespace-nowrap sm:text-xs",
  "@max-sm/artifact-panel:whitespace-normal @max-sm/artifact-panel:h-auto @max-sm/artifact-panel:px-2",
  "text-muted-foreground transition-all duration-200 ease-out",
  "hover:bg-surface-2/80 hover:text-foreground",
  "active:scale-[0.96] active:duration-75",
  "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
  "data-[state=active]:scale-100 data-[state=active]:font-semibold",
  "after:absolute after:inset-x-2 after:bottom-0.5 after:h-0.5 after:rounded-full",
  "after:scale-x-0 after:bg-current after:opacity-0 after:transition-transform after:duration-200",
  "data-[state=active]:after:scale-x-100 data-[state=active]:after:opacity-100",
);
