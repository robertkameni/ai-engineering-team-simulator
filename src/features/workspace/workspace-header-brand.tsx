import Link from "next/link";
import { Home } from "lucide-react";

import { Button } from "@/components/ui/button";
import { workspaceHeaderHomeButtonClass } from "@/components/ui/button-styles";

export function WorkspaceHeaderHomeButton() {
  return (
    <Button
      variant="outline"
      size="icon"
      className={workspaceHeaderHomeButtonClass}
      asChild
    >
      <Link href="/" aria-label="Back to home" title="Back to home">
        <Home className="size-4" />
      </Link>
    </Button>
  );
}

interface WorkspaceHeaderTitleProps {
  title: string;
  subtitle?: string;
}

export function WorkspaceHeaderTitle({
  title,
  subtitle,
}: WorkspaceHeaderTitleProps) {
  return (
    <div className="min-w-0 flex-1">
      <h1 className="truncate text-body font-semibold tracking-tight text-foreground @[720px]/app-shell:text-title">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-0.5 hidden truncate text-caption text-muted-foreground @[720px]/app-shell:block">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
