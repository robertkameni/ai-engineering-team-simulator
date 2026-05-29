"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TeamTemplateId } from "@/ai/agents/team-templates";
import type { MockRun } from "@/features/agents/types";
import { ExportAuthModal } from "@/features/workspace/export-auth-modal";
import { workspaceHeaderExportButtonClass } from "@/features/workspace/workspace-header-button-styles";
import { exportRunMarkdown } from "@/lib/export/run-markdown";
import { exportRunPdf } from "@/lib/export/run-pdf-client";
import type { ExportFormat } from "@/features/workspace/export-format";
import { cn } from "@/lib/utils";

interface ExportRunButtonProps {
  run: MockRun;
  isAuthenticated?: boolean;
  templateId?: TeamTemplateId;
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
  templateId,
}: ExportRunButtonProps) {
  const router = useRouter();
  const disabled = run.messages.length === 0;
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingExportRun, setPendingExportRun] = useState<MockRun | null>(null);
  const [pendingFormat, setPendingFormat] = useState<ExportFormat>("markdown");
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const isExporting = exportingFormat != null;

  const performExport = useCallback(
    async (targetRun: MockRun, format: ExportFormat) => {
      setExportError(null);
      try {
        if (format === "pdf") {
          await exportRunPdf(targetRun, templateId, () =>
            setExportingFormat("pdf"),
          );
        } else {
          setExportingFormat(format);
          await exportRunMarkdown(targetRun, templateId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Export failed";
        console.error("[export]", message, error);
        setExportError(message);
      } finally {
        setExportingFormat(null);
      }
    },
    [templateId],
  );

  const handleFormatSelect = useCallback(
    (format: ExportFormat) => {
      if (exportingFormat != null) {
        return;
      }

      if (!isAuthenticated) {
        setPendingFormat(format);
        setPendingExportRun(run);
        setModalOpen(true);
        return;
      }

      void performExport(run, format);
    },
    [isAuthenticated, performExport, run, exportingFormat],
  );

  const handleAuthSuccess = useCallback(async () => {
    await claimGuestRuns();
    router.refresh();

    const targetRun = pendingExportRun;
    const format = pendingFormat;
    setPendingExportRun(null);

    if (targetRun) {
      await performExport(targetRun, format);
    }
  }, [pendingExportRun, pendingFormat, performExport, router]);

  const exportButtonLabel =
    exportingFormat === "pdf"
      ? "Generating PDF…"
      : exportingFormat === "markdown"
        ? "Exporting…"
        : "Export";

  return (
    <>
      <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || isExporting}
            aria-label={exportButtonLabel}
            aria-busy={isExporting}
            title={exportButtonLabel}
            className={workspaceHeaderExportButtonClass}
          >
            {isExporting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="size-3.5" />
            )}
            <span
              className={cn(
                isExporting
                  ? "inline"
                  : "hidden @[520px]/workspace-header:inline",
              )}
            >
              {exportButtonLabel}
            </span>
            <ChevronDown
              className={cn("size-3 opacity-60", isExporting && "opacity-30")}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isExporting}
            onSelect={() => handleFormatSelect("markdown")}
          >
            <FileText className="size-4" />
            Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isExporting}
            onSelect={() => handleFormatSelect("pdf")}
          >
            <FileText className="size-4" />
            PDF (.pdf)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {exportError ? (
        <p
          role="alert"
          className="max-w-48 text-right text-xs text-destructive"
        >
          {exportError}
        </p>
      ) : null}
      </div>

      <ExportAuthModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setPendingExportRun(null);
          }
        }}
        onAuthSuccess={handleAuthSuccess}
        exportFormat={pendingFormat}
      />
    </>
  );
}
