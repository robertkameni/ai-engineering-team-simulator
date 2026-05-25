import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

config({ path: ".env.local" });
config({ path: ".env" });

/** Non-pooler URL for migrations (Neon advisory locks fail on `-pooler`). */
function resolveDirectUrl(): string | undefined {
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
  if (pooled?.includes("-pooler.")) {
    return pooled.replace("-pooler.", ".");
  }

  return undefined;
}

const directUrl = resolveDirectUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    ...(directUrl ? { directUrl } : {}),
  },
});
