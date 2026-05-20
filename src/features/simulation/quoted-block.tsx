import { cn } from "@/lib/utils";

interface QuotedBlockProps {
  agentName: string;
  text: string;
  verdict?: string;
  className?: string;
}

export function QuotedBlock({
  agentName,
  text,
  verdict,
  className,
}: QuotedBlockProps) {
  return (
    <blockquote
      className={cn(
        "glass-card my-3 rounded-xl px-3 py-2.5 text-caption leading-relaxed text-muted-foreground",
        "border-l-2 border-l-agent-reviewer/60",
        className,
      )}
    >
      <span className="font-sans font-semibold text-foreground">{agentName}</span>
      <span className="text-muted-foreground"> — </span>
      <span className="italic text-foreground/85">&ldquo;{text}&rdquo;</span>
      {verdict ? (
        <p className="mt-1.5 font-medium text-foreground/90">{verdict}</p>
      ) : null}
    </blockquote>
  );
}
