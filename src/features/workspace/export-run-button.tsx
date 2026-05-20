"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MockRun } from "@/features/agents/types";
import { downloadRunMarkdown } from "@/lib/export/run-markdown";

interface ExportRunButtonProps {
  run: MockRun;
}

export function ExportRunButton({ run }: ExportRunButtonProps) {
  const disabled = run.messages.length === 0;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={() => downloadRunMarkdown(run)}
      className="glass-card h-8 gap-1.5 border-glass-border px-2.5 text-caption transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] @[720px]/workspace-header:h-8"
    >
      <Download className="size-3.5" />
      <span className="hidden @[520px]/workspace-header:inline">Export</span>
    </Button>
  );
}
