import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findStaleStackViolations,
  validateArtifactStackConsistency,
} from "@/ai/artifacts/validate-artifact-consistency";
import type { ArtifactDocument } from "@/features/artifacts/schemas";

function buildDocument(items: string[]): ArtifactDocument {
  return {
    sections: [{ title: "Dependencies", items }],
  };
}

describe("validateArtifactStackConsistency", () => {
  it("flags stale Next.js and Prisma majors in blueprint and implementation", () => {
    const violations = validateArtifactStackConsistency({
      implementation: buildDocument(["Uses Next.js 14.2 with App Router."]),
      blueprint: buildDocument(["Prisma 5.14 as the ORM."]),
    });

    assert.ok(violations.some((violation) => violation.startsWith("implementation:")));
    assert.ok(violations.some((violation) => violation.startsWith("blueprint:")));
  });

  it("accepts stack versions aligned with the verified reference", () => {
    const violations = findStaleStackViolations(
      "Next.js 16 App Router and Prisma 7 migrations.",
    );

    assert.equal(violations.length, 0);
  });
});
