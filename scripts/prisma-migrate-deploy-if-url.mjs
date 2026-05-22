/**
 * Run `prisma migrate deploy` when DATABASE_URL is available (same env loading
 * convention as prisma.config.ts). Skip otherwise so `npm run build` still works
 * in CI without secrets and for static checks.
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.warn(
    "[build] DATABASE_URL not set — skipping prisma migrate deploy. " +
      "Vercel + Neon: set DATABASE_URL on the project so migrations run on deploy.",
  );
  process.exit(0);
}

execSync("npx prisma migrate deploy", { stdio: "inherit" });
