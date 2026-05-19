import { cn } from "@/lib/utils";

interface MessageContentProps {
  content: string;
  className?: string;
}

/** Lightweight markdown-ish rendering for demo messages */
export function MessageContent({ content, className }: MessageContentProps) {
  const lines = content.split("\n");

  return (
    <div
      className={cn(
        "max-w-none text-sm leading-relaxed text-foreground/90",
        className,
      )}
    >
      {lines.map((line, index) => {
        const key = `${index}-${line.slice(0, 24)}`;

        if (line.startsWith("### ")) {
          return (
            <h4
              key={key}
              className="mt-4 mb-1 text-sm font-semibold text-foreground"
            >
              {line.slice(4)}
            </h4>
          );
        }

        if (line.startsWith("## ")) {
          return (
            <h3
              key={key}
              className="mt-2 mb-2 text-base font-semibold text-foreground"
            >
              {line.slice(3)}
            </h3>
          );
        }

        if (line.startsWith("- ")) {
          return (
            <p key={key} className="my-0.5 pl-1 text-muted-foreground">
              <span className="mr-2 text-muted-foreground/60">○</span>
              {formatInline(line.slice(2))}
            </p>
          );
        }

        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={key} className="my-1 font-medium text-foreground">
              {line.slice(2, -2)}
            </p>
          );
        }

        if (line.trim() === "") {
          return <div key={key} className="h-2" />;
        }

        return (
          <p key={key} className="my-1">
            {formatInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
