import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SimulationErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function SimulationErrorBanner({
  message,
  onRetry,
}: SimulationErrorBannerProps) {
  return (
    <div
      role="alert"
      className="mx-4 mt-3 flex shrink-0 items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Simulation failed
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
