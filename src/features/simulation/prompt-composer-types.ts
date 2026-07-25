import type { ReactNode } from "react";

/**
 * Live-run session supplied by the workspace composition root (Sprint A / N1).
 * PromptComposer must not import workspace context directly.
 */
export type PromptComposerRunSession = {
  readonly currentPrompt: string;
  readonly canRerun: boolean;
  readonly onRerun: (prompt: string) => void;
};

export type PromptComposerProps = {
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onSimulate?: (prompt: string) => void | Promise<void>;
  readonly runSession?: PromptComposerRunSession | null;
};

export type ComposerDerivedState = {
  readonly text: string;
  readonly isLiveWorkspace: boolean;
  readonly canRerun: boolean;
  readonly sheetTitle: string;
  readonly sheetDescription: string;
  readonly mobileAriaLabel: string;
  readonly mobileIcon: ReactNode;
};

export type PromptComposerFabProps = {
  readonly disabled: boolean;
  readonly ariaLabel: string;
  readonly icon: ReactNode;
  readonly onClick: () => void;
};
