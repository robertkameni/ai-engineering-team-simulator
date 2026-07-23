import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import type { RunOwnershipScope } from "@/lib/auth/run-ownership";

/** Prisma where clause scoping runs to the current user and/or guest session. */
export function buildRunOwnershipWhere(
  scope: RunOwnershipScope,
): Prisma.RunWhereInput | null {
  const conditions: Prisma.RunWhereInput[] = [];

  if (scope.userId != null) {
    conditions.push({ userId: scope.userId });
  }

  if (scope.guestSessionId != null) {
    conditions.push({
      guestSessionId: scope.guestSessionId,
      userId: null,
    });
  }

  if (conditions.length === 0) {
    return null;
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { OR: conditions };
}
