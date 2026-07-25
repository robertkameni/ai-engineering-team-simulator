import { cn } from "@/lib/utils";

const headerActionBase = cn(
  "glass-card shrink-0 font-normal",
  "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
);

/** Signed-in account / sign out */
export const workspaceHeaderAccountButtonClass = cn(
  headerActionBase,
  "h-8 gap-1.5 px-2.5 text-caption",
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  "hover:border-emerald-500/50 hover:bg-emerald-500/15 hover:text-emerald-700",
  "dark:text-emerald-400 dark:hover:text-emerald-300",
);

/** Back to home */
export const workspaceHeaderHomeButtonClass = cn(
  headerActionBase,
  "size-8",
  "border-sky-500/40 bg-sky-500/10 text-sky-700",
  "hover:border-sky-500/50 hover:bg-sky-500/15 hover:text-sky-700",
  "dark:text-sky-400 dark:hover:text-sky-300",
);

/** Export / download deliverable */
export const workspaceHeaderExportButtonClass = cn(
  headerActionBase,
  "h-8 gap-1.5 px-2.5 text-caption",
  "border-violet-500/40 bg-violet-500/10 text-violet-700",
  "hover:border-violet-500/50 hover:bg-violet-500/15 hover:text-violet-700",
  "dark:text-violet-400 dark:hover:text-violet-300",
);

/** Regenerate artifacts */
export const workspaceHeaderRegenerateButtonClass = cn(
  headerActionBase,
  "h-8 gap-1.5 px-2.5 text-caption",
  "border-cyan-500/40 bg-cyan-500/10 text-cyan-700",
  "hover:border-cyan-500/50 hover:bg-cyan-500/15 hover:text-cyan-700",
  "dark:text-cyan-400 dark:hover:text-cyan-300",
);
