import { cn } from "@/lib/utils";

interface QuotedBlockProps {
  agentName: string;
  text: string;
  className?: string;
}

export function QuotedBlock({ agentName, text, className }: QuotedBlockProps) {
  return (
    <blockquote
      className={cn(
        "my-3 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      <span className="font-sans font-medium text-foreground">{agentName}</span>
      <span className="text-muted-foreground"> said: </span>
      <span className="italic">&ldquo;{text}&rdquo;</span>
    </blockquote>
  );
}
