import { QuotedBlock } from "@/features/simulation/quoted-block";
import { parseMessageBlocks } from "@/features/simulation/parse-message-blocks";
import { cn } from "@/lib/utils";

interface MessageContentProps {
  content: string;
  className?: string;
}

export function MessageContent({ content, className }: MessageContentProps) {
  const blocks = parseMessageBlocks(content);

  return (
    <div
      className={cn(
        "max-w-none text-body leading-relaxed text-foreground/90",
        className,
      )}
    >
      {blocks.map((block, index) => {
        const key = `${index}-${block.type}`;

        if (block.type === "spacer") {
          return <div key={key} className="h-2" />;
        }

        if (block.type === "heading") {
          if (block.level === 2) {
            return (
              <h3
                key={key}
                className="mt-2 mb-2 text-title font-semibold text-foreground"
              >
                {block.text}
              </h3>
            );
          }
          return (
            <h4
              key={key}
              className="mt-4 mb-1 text-body font-semibold text-foreground"
            >
              {block.text}
            </h4>
          );
        }

        if (block.type === "quote") {
          return (
            <QuotedBlock
              key={key}
              agentName={block.agentName}
              text={block.text}
              verdict={block.verdict}
              className="my-2"
            />
          );
        }

        if (block.type === "bullet") {
          return (
            <p key={key} className="my-0.5 pl-1 text-muted-foreground">
              <span className="mr-2 text-muted-foreground/60">○</span>
              {formatInline(block.text)}
            </p>
          );
        }

        if (block.type === "emphasis") {
          return (
            <p key={key} className="my-1 font-medium text-foreground">
              {block.text}
            </p>
          );
        }

        return (
          <p key={key} className="my-1">
            {formatInline(block.text)}
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
          className="rounded bg-muted/60 px-1 py-0.5 font-mono text-caption text-foreground"
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
