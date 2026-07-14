const SENTENCE_TERMINATORS = /[.!?…»")\]]\s*$/u;
const COLON_TERMINATOR = /:\s*$/u;

const MIN_COLON_TERMINATOR_LINE_CHARS = 40;

const INCOMPLETE_SPEC_LINE =
  /^-?\s*(?:Method and path|Request schema|Mutation logic|Response codes|Indexes and transactions|Idempotency)\s*:\s*$/i;

export function lastNonEmptyLine(text: string): string {
  const lines = text.trim().split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? "";
    if (line.length > 0) {
      return line;
    }
  }
  return "";
}

export function isIncompleteSpecLine(line: string): boolean {
  return INCOMPLETE_SPEC_LINE.test(line.trim());
}

export function hasCompleteSentenceEnding(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  const lastLine = lastNonEmptyLine(trimmed);

  if (isIncompleteSpecLine(lastLine)) {
    return false;
  }

  if (isShortWordFragment(lastLine)) {
    return false;
  }

  if (
    lastLine.length <= MIN_COLON_TERMINATOR_LINE_CHARS &&
    COLON_TERMINATOR.test(lastLine)
  ) {
    return false;
  }

  return SENTENCE_TERMINATORS.test(lastLine);
}

export function isShortWordFragment(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (trimmed.length <= 4 && /^[a-z]+$/i.test(trimmed)) {
    return true;
  }
  return /\s[a-z]{1,3}$/i.test(trimmed);
}
