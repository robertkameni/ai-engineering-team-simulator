/**
 * Neon pooled URLs (`-pooler`) cannot run Prisma migrations (advisory lock timeout P1002).
 * Prefer DIRECT_DATABASE_URL; otherwise strip `-pooler` from DATABASE_URL.
 */
export function resolveMigrateDatabaseUrl() {
  for (const key of [
    "DIRECT_DATABASE_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
  ]) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  const pooled = process.env.DATABASE_URL?.trim();
  if (!pooled) {
    return null;
  }

  if (pooled.includes("-pooler.")) {
    return pooled.replace("-pooler.", ".");
  }

  return pooled;
}
