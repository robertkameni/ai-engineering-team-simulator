"use client";

import { useActionState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteRunAction,
  type DeleteRunActionState,
} from "@/features/workspace/delete-run-action";

const INITIAL_STATE: DeleteRunActionState = { error: null };

interface SidebarDeleteRunFormProps {
  runId: string;
  runTitle: string;
  activePath: string;
}

/** Client form so Server Action rate_limited errors surface (arch-review F8). */
export function SidebarDeleteRunForm({
  runId,
  runTitle,
  activePath,
}: SidebarDeleteRunFormProps) {
  const [state, formAction, isPending] = useActionState(
    deleteRunAction,
    INITIAL_STATE,
  );

  return (
    <div className="relative">
      <form action={formAction}>
        <input type="hidden" name="runId" value={runId} />
        <input type="hidden" name="activePath" value={activePath} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={isPending}
          aria-label={`Delete run: ${runTitle}`}
          className="my-1 mr-1 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-lg:opacity-70"
        >
          <X className="size-3.5" />
        </Button>
      </form>
      {state.error ? (
        <p
          role="alert"
          className="absolute right-1 top-full z-10 mt-1 max-w-48 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
        >
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
