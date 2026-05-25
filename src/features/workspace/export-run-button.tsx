"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MockRun } from "@/features/agents/types";
import { ExportAuthModal } from "@/features/workspace/export-auth-modal";
import { workspaceHeaderExportButtonClass } from "@/features/workspace/workspace-header-button-styles";
import { exportRunMarkdown } from "@/lib/export/run-markdown";

interface ExportRunButtonProps {
  run: MockRun;
  isAuthenticated?: boolean;
}

async function claimGuestRuns(): Promise<void> {
  const response = await fetch("/api/auth/claim-guest-runs", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to attach guest runs to your account");
  }
}

export function ExportRunButton({
  run,
  isAuthenticated = false,
}: ExportRunButtonProps) {
  const router = useRouter();
  const disabled = run.messages.length === 0;
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingExportRun, setPendingExportRun] = useState<MockRun | null>(null);

  const performExport = useCallback(async (targetRun: MockRun) => {
    await exportRunMarkdown(targetRun);
  }, []);

  const handleAuthSuccess = useCallback(async () => {
    await claimGuestRuns();
    router.refresh();

    const targetRun = pendingExportRun;
    setPendingExportRun(null);

    if (targetRun) {
      await performExport(targetRun);
    }
  }, [pendingExportRun, performExport, router]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        aria-label="Export run as Markdown"
        title="Export run as Markdown"
        className={workspaceHeaderExportButtonClass}
        onClick={() => {
          if (isAuthenticated) {
            void performExport(run);
            return;
          }

          setPendingExportRun(run);
          setModalOpen(true);
        }}
      >
        <Download className="size-3.5" />
        <span className="hidden @[520px]/workspace-header:inline">Export</span>
      </Button>

      <ExportAuthModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingExportRun(null);
          }
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    </>
  );
}
