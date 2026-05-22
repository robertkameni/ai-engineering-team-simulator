import type { Prisma } from "@/generated/prisma/client";

import type {
  ArtifactDocument,
  RunArtifactsOutput,
} from "@/features/artifacts/schemas";
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  isArtifactType,
} from "@/features/artifacts/schemas";
import type { RunArtifacts } from "@/features/artifacts/types";
import { TEAM_ROSTER_ARTIFACT_TYPE } from "@/lib/db/team-roster";
import { prisma } from "@/lib/prisma";

export async function upsertArtifact(
  runId: string,
  type: string,
  data: Prisma.InputJsonValue,
) {
  return prisma.artifact.upsert({
    where: {
      runId_type: { runId, type },
    },
    create: { runId, type, data },
    update: { data },
  });
}

export async function getArtifactsForRun(runId: string) {
  return prisma.artifact.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
}

export async function saveArtifactBundle(runId: string, artifacts: RunArtifacts) {
  await prisma.$transaction(
    ARTIFACT_TYPES.map((type) => {
      const data: ArtifactDocument = { sections: artifacts[type] };
      const json = data as unknown as Prisma.InputJsonValue;

      return prisma.artifact.upsert({
        where: {
          runId_type: { runId, type },
        },
        create: { runId, type, data: json },
        update: { data: json },
      });
    }),
  );
}

export async function saveRunArtifacts(
  runId: string,
  artifacts: RunArtifacts,
) {
  await saveArtifactBundle(runId, artifacts);
}

export async function saveSingleArtifact(
  runId: string,
  type: ArtifactType,
  document: ArtifactDocument,
) {
  return upsertArtifact(
    runId,
    type,
    document as unknown as Prisma.InputJsonValue,
  );
}

export function runArtifactsOutputToBundle(
  output: RunArtifactsOutput,
): RunArtifacts {
  return {
    requirements: output.requirements.sections,
    architecture: output.architecture.sections,
    implementation: output.implementation.sections,
    review: output.review.sections,
  };
}

function parseArtifactDocument(data: unknown): ArtifactDocument | null {
  if (data == null || typeof data !== "object") return null;
  const sections = (data as ArtifactDocument).sections;
  if (!Array.isArray(sections)) return null;
  return { sections };
}

export function mapDbArtifactsToRunArtifacts(
  rows: { type: string; data: unknown }[],
): RunArtifacts | null {
  const bundle = {} as Partial<RunArtifacts>;
  let found = 0;

  for (const row of rows) {
    if (row.type === TEAM_ROSTER_ARTIFACT_TYPE || !isArtifactType(row.type)) {
      continue;
    }
    const doc = parseArtifactDocument(row.data);
    if (!doc) continue;
    bundle[row.type] = doc.sections;
    found += 1;
  }

  if (found !== ARTIFACT_TYPES.length) {
    return null;
  }

  return bundle as RunArtifacts;
}
