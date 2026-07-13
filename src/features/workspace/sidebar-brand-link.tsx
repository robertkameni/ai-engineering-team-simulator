import Link from "next/link";
import { Sparkles } from "lucide-react";

interface SidebarBrandLinkProps {
  onNavigate?: () => void;
}

export function SidebarBrandLink({ onNavigate }: SidebarBrandLinkProps) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-lg transition-colors hover:bg-white/4"
    >
      <span className="glass-card flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Sparkles className="size-4 text-agent-architect" />
      </span>
      <span className="min-w-0">
        <p className="truncate text-title font-semibold tracking-tight">
          Team Sim
        </p>
        <p className="truncate text-caption text-muted-foreground">
          Engineering simulator
        </p>
      </span>
    </Link>
  );
}
