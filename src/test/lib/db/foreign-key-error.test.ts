import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@/generated/prisma/client";
import { isForeignKeyViolation } from "@/lib/db/foreign-key-error";

describe("isForeignKeyViolation", () => {
  it("returns true for a Prisma P2003 foreign-key error", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Foreign key constraint violated on the constraint: `Artifact_runId_fkey`",
      { code: "P2003", clientVersion: "7.10.0" },
    );

    assert.equal(isForeignKeyViolation(error), true);
  });

  it("returns false for a Prisma error with a different code", () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      "Record not found",
      { code: "P2025", clientVersion: "7.10.0" },
    );

    assert.equal(isForeignKeyViolation(error), false);
  });

  it("returns false for non-Prisma errors", () => {
    assert.equal(isForeignKeyViolation(new Error("boom")), false);
    assert.equal(isForeignKeyViolation("P2003"), false);
    assert.equal(isForeignKeyViolation(null), false);
  });
});
