import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  PackageManifest,
  VerifiedStackSnapshot,
} from "@/ai/context/simulation-stack-reference.types";

const STACK_PACKAGE_KEYS = [
  "next",
  "react",
  "typescript",
  "prisma",
  "@prisma/client",
  "zod",
] as const;

function readPackageVersions(): ReadonlyMap<string, string> {
  const manifestPath = join(process.cwd(), "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
  const merged = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
  };

  const versions = new Map<string, string>();
  for (const packageName of STACK_PACKAGE_KEYS) {
    const version = merged[packageName];
    if (version) {
      versions.set(packageName, version);
    }
  }

  return versions;
}

function parseMajorVersion(versionRange: string | undefined): number | null {
  if (!versionRange) {
    return null;
  }
  const match = versionRange.match(/(\d+)/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1]!, 10);
}

export function getVerifiedStackSnapshot(): VerifiedStackSnapshot {
  const versions = readPackageVersions();
  return {
    nextMajor: parseMajorVersion(versions.get("next")),
    prismaMajor: parseMajorVersion(versions.get("prisma")),
  };
}

export function buildSimulationStackReferenceDirective(): string {
  const versions = readPackageVersions();
  const versionLines = [...versions.entries()]
    .map(([packageName, version]) => `- ${packageName}: ${version}`)
    .join("\n");

  return `## Verified modern web stack reference
These are the reference versions the product being designed will use. Treat them as the product's own chosen stack.
${versionLines}
- Test runner: Node.js native \`node --test\` (not vitest or jest unless verified for that product)
- Database migrations: Prisma \`migrate dev\` / \`migrate deploy\` (not node-pg-migrate or raw SQL migration runners unless required)
Do not cite stale major versions (Next.js 14, Prisma 6, TypeScript 5) when a newer verified version is listed above.
Do not introduce AI / LLM features or AI SDK dependencies unless the Product Idea explicitly requires them — an AI feature that no team member proposed is out of scope.
Never reference the host application, its repository, its package.json, or any surrounding simulator tooling in your deliverables. Describe dependencies as the product's stack, never as versions copied from an existing project file.`;
}
