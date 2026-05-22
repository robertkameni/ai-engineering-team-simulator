-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('NONE', 'PENDING', 'GENERATING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "artifactStatus" "ArtifactStatus" NOT NULL DEFAULT 'NONE';

-- Backfill READY for runs with a full deliverable bundle
UPDATE "Run" AS r
SET "artifactStatus" = 'READY'
WHERE (
  SELECT COUNT(*)::int
  FROM "Artifact" AS a
  WHERE a."runId" = r.id
    AND a.type IN ('requirements', 'architecture', 'implementation', 'review')
) = 4;

-- Backfill FAILED for completed runs without a full bundle
UPDATE "Run" AS r
SET "artifactStatus" = 'FAILED'
WHERE r.status = 'COMPLETE'
  AND r."artifactStatus" = 'NONE';
