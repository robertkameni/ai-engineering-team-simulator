import { prisma } from "@/lib/prisma";

const DEFAULT_PROJECT_TITLE = "My simulations";

export async function getOrCreateDefaultProject() {
  const existing = await prisma.project.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.project.create({
    data: { title: DEFAULT_PROJECT_TITLE },
  });
}