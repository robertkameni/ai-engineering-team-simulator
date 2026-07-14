import type { SynthesisValidationFlags } from "@/features/artifacts/synthesis-validation.types";

export function hasSynthesisValidationWarnings(
  flags: SynthesisValidationFlags | null | undefined,
): boolean {
  return (
    flags?.stackValidationFailed === true ||
    flags?.crossValidationFailed === true
  );
}

export function synthesisValidationWarningMessage(
  flags: SynthesisValidationFlags,
): string {
  const messages: string[] = [];

  if (flags.stackValidationFailed) {
    messages.push(
      "Implementation or Blueprint may cite stale dependency major versions.",
    );
  }

  if (flags.crossValidationFailed) {
    messages.push(
      "Architecture or Implementation may contradict reviewer open gaps.",
    );
  }

  return messages.join(" ");
}

export function parseSynthesisValidationFlags(
  stackValidationFailed?: boolean,
  crossValidationFailed?: boolean,
): SynthesisValidationFlags {
  return {
    stackValidationFailed: stackValidationFailed === true,
    crossValidationFailed: crossValidationFailed === true,
  };
}
