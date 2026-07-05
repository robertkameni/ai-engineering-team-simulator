import type { ReactNode } from "react";

export type PromptComposerProps = {
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
  readonly defaultValue?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onSimulate?: (prompt: string) => void | Promise<void>;
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
