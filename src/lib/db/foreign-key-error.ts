import { Prisma } from "@/generated/prisma/client";

/**
 * Prisma raises P2003 when an insert/update violates a foreign-key constraint
 * (e.g. writing an Artifact or Message for a Run that was just deleted).
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}
