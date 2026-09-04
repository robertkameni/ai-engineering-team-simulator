"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportAuthModal } from "@/features/workspace/export-auth-modal";
import { cn } from "@/lib/utils";

type OpenInForgeButtonProps = {
  readonly runId: string;
  readonly isAuthenticated?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
};

type HandoffSuccessBody = {
  readonly trackerUrl: string;
};

async function claimGuestRuns(): Promise<void> {
  try {
    await fetch("/api/auth/claim-guest-runs", { method: "POST" });
  } catch {
    // non-blocking; mirror export button
  }
}

export function OpenInForgeButton({
  runId,
  isAuthenticated = false,
  disabled = false,
  className,
}: OpenInForgeButtonProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingAfterAuth, setPendingAfterAuth] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startHandoff = useCallback(async () => {
    setError(null);
    setIsPending(true);
    const blankTab = window.open("about:blank", "_blank", "noopener,noreferrer");

    try {
      const response = await fetch(`/api/runs/${runId}/forge-handoff`, {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | HandoffSuccessBody
        | { error?: string }
        | null;

      if (!response.ok) {
        blankTab?.close();
        setError(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not start Forge pipeline",
        );
        return;
      }

      if (!payload || !("trackerUrl" in payload) || !payload.trackerUrl) {
        blankTab?.close();
        setError("Could not start Forge pipeline");
        return;
      }

      if (blankTab) {
        blankTab.location.href = payload.trackerUrl;
      } else {
        window.open(payload.trackerUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      blankTab?.close();
      setError("Could not start Forge pipeline");
    } finally {
      setIsPending(false);
    }
  }, [runId]);

  const handleClick = useCallback(() => {
    if (disabled || isPending) {
      return;
    }
    if (!isAuthenticated) {
      setPendingAfterAuth(true);
      setModalOpen(true);
      return;
    }
    void startHandoff();
  }, [disabled, isAuthenticated, isPending, startHandoff]);

  const handleAuthSuccess = useCallback(async () => {
    await claimGuestRuns();
    router.refresh();
    setModalOpen(false);
    if (pendingAfterAuth) {
      setPendingAfterAuth(false);
      await startHandoff();
    }
  }, [pendingAfterAuth, router, startHandoff]);

  return (
    <div className={cn("flex flex-col items-stretch gap-1", className)}>
      <Button
        type="button"
        className="gap-2"
        disabled={disabled || isPending}
        onClick={handleClick}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ExternalLink className="size-4" aria-hidden />
        )}
        {isPending ? "Opening Forge…" : "Open in Forge"}
      </Button>
      {error ? (
        <p className="text-center text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ExportAuthModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingAfterAuth(false);
          }
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}
