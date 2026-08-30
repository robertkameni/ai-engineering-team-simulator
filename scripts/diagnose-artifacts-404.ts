import { SignJWT } from "jose";
import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";

async function main(): Promise<void> {
  const userId = process.argv[2] ?? "bda14deb-cb95-44cc-8e00-9f0e1ff8b3ab";
  const baseUrl = process.argv[3] ?? "http://localhost:3000";
  const runId = process.argv[4] ?? "cmtfyr46e0000x4tvi363j8go";

  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) {
      console.log("USER NOT FOUND:", userId);
      return;
    }

    const secret = (process.env.AUTH_SECRET ?? "dev-auth-secret-change-me").trim();
    const token = await new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("2592000s")
      .sign(new TextEncoder().encode(secret));

    const url = `${baseUrl}/api/runs/${runId}/artifacts`;
    const response = await fetch(url, {
      headers: { cookie: `team-sim-auth-session=${token}` },
    });
    const body = await response.text();
    console.log("artifacts GET with valid auth cookie");
    console.log("status:", response.status);
    console.log("body head:", body.slice(0, 200));

    const noCookie = await fetch(url);
    const noCookieBody = await noCookie.text();
    console.log("artifacts GET without any cookie");
    console.log("status:", noCookie.status);
    console.log("body head:", noCookieBody.slice(0, 200));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
