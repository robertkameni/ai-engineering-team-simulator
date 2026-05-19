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

export async function createProject(title: string) {
  return prisma.project.create({
    data: { title },
  });
}

export async function listRecentProjects(limit = 20) {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      runs: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });
}
