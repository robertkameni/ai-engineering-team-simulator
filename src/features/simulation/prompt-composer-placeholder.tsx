/** Lightweight shell while the client composer chunk loads. */
export function PromptComposerPlaceholder() {
  return (
    <div
      className="@container/composer glass-panel hidden h-21 shrink-0 border-t-0 border-glass-border min-[720px]:block"
      aria-hidden
    />
  );
}
