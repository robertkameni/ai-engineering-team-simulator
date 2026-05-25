/**
 * Run `prisma migrate deploy` when DATABASE_URL is available (same env loading
 * convention as prisma.config.ts). Skip otherwise so `npm run build` still works
 * in CI without secrets and for static checks.
 *
 * Uses a direct (non-pooler) connection — required for Neon advisory locks.
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

import { resolveMigrateDatabaseUrl } from "./resolve-migrate-database-url.mjs";

config({ path: ".env.local" });
config({ path: ".env" });

const migrateUrl = resolveMigrateDatabaseUrl();
if (!migrateUrl) {
  console.warn(
    "[build] DATABASE_URL not set — skipping prisma migrate deploy. " +
      "Vercel + Neon: set DATABASE_URL on the project so migrations run on deploy.",
  );
  process.exit(0);
}

const maxAttempts = 3;
const retryDelayMs = 5_000;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: migrateUrl,
        DIRECT_DATABASE_URL: migrateUrl,
      },
    });
    process.exit(0);
  } catch (error) {
    const isLast = attempt === maxAttempts;
    console.warn(
      `[build] prisma migrate deploy attempt ${attempt}/${maxAttempts} failed.`,
    );
    if (isLast) {
      throw error;
    }
    console.warn(`[build] Retrying in ${retryDelayMs / 1000}s…`);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}
