import { Badge } from "@/components/ui/badge";
import type { RunUsageTotals } from "@/lib/ai/run-usage";
import { formatTokenCount, formatUsdCost } from "@/lib/format-usage";
import { cn } from "@/lib/utils";

interface RunUsagePillProps {
  usage: RunUsageTotals;
  className?: string;
  compactOnMobile?: boolean;
}

export function RunUsagePill({
  usage,
  className,
  compactOnMobile = false,
}: RunUsagePillProps) {
  if (usage.totalTokens <= 0) {
    return null;
  }

  const label = `${formatTokenCount(usage.totalTokens)} tok · ${formatUsdCost(usage.estimatedCostUsd)}`;
  const tooltip = `Prompt: ${usage.promptTokens.toLocaleString()} · Completion: ${usage.completionTokens.toLocaleString()} · Total: ${usage.totalTokens.toLocaleString()} · Est. ${formatUsdCost(usage.estimatedCostUsd)}`;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border-muted-foreground/30 bg-muted/20 font-normal text-muted-foreground",
        className,
      )}
      title={tooltip}
    >
      <span
        className={cn(
          compactOnMobile &&
            "sr-only @[420px]/workspace-header:not-sr-only",
        )}
      >
        {label}
      </span>
      {compactOnMobile ? (
        <span className="@[420px]/workspace-header:hidden" aria-hidden>
          {formatTokenCount(usage.totalTokens)}
        </span>
      ) : null}
    </Badge>
  );
}
