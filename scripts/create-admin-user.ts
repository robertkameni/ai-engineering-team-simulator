import "dotenv/config";

import bcrypt from "bcryptjs";
import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

const ADMIN_EMAIL = "admin@ai-team-simulation.dev";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const password =
    process.env.ADMIN_INITIAL_PASSWORD?.trim() ||
    `${crypto.randomUUID().slice(0, 10)}A1!`;

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
  });

  try {
    const existing = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (existing) {
      console.log(`User already exists: ${existing.id}`);
      console.log(`Email: ${ADMIN_EMAIL}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
      },
    });

    console.log(`Created user: ${user.id}`);
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${password}`);
    console.log("Store this password securely and change it after first login.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
