import { getVerifiedStackSnapshot } from "@/ai/context/simulation-stack-reference";
import type { ArtifactDocument, RunArtifactsOutput } from "@/features/artifacts/schemas";

const NEXT_JS_VERSION_PATTERN = /\bNext\.js\s+(\d+)/gi;
const PRISMA_VERSION_PATTERN = /\bPrisma\s+(\d+)/gi;

export function collectArtifactDocumentText(document: ArtifactDocument): string {
  return document.sections
    .flatMap((section) => [section.title, ...section.items])
    .join("\n");
}

export function findStaleStackViolations(text: string): string[] {
  const violations: string[] = [];
  const snapshot = getVerifiedStackSnapshot();

  if (snapshot.nextMajor != null) {
    for (const match of text.matchAll(NEXT_JS_VERSION_PATTERN)) {
      const citedMajor = Number.parseInt(match[1]!, 10);
      if (citedMajor < snapshot.nextMajor) {
        violations.push(
          `cites Next.js ${citedMajor} but verified stack requires Next.js ${snapshot.nextMajor}+`,
        );
      }
    }
  }

  if (snapshot.prismaMajor != null) {
    for (const match of text.matchAll(PRISMA_VERSION_PATTERN)) {
      const citedMajor = Number.parseInt(match[1]!, 10);
      if (citedMajor < snapshot.prismaMajor) {
        violations.push(
          `cites Prisma ${citedMajor} but verified stack requires Prisma ${snapshot.prismaMajor}+`,
        );
      }
    }
  }

  return [...new Set(violations)];
}

export function validateArtifactStackConsistency(
  output: Partial<RunArtifactsOutput>,
): string[] {
  const violations: string[] = [];

  for (const type of ["implementation", "blueprint"] as const) {
    const document = output[type];
    if (!document) {
      continue;
    }

    const documentViolations = findStaleStackViolations(
      collectArtifactDocumentText(document),
    );
    for (const violation of documentViolations) {
      violations.push(`${type}: ${violation}`);
    }
  }

  return violations;
}

export function buildStackConsistencyFixPrompt(violations: readonly string[]): string {
  return [
    "CRITICAL stack consistency fix:",
    ...violations.map((violation) => `- ${violation}`),
    "Regenerate this artifact using only the verified modern web stack reference and prior artifacts.",
  ].join("\n");
}
