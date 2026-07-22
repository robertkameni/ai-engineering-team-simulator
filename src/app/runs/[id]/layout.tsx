import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { getCachedRunPageView } from "./get-cached-run-page-view";

interface RunLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Ownership/existence gate outside loading.tsx's Suspense boundary so
 * missing or forbidden runs return HTTP 404 (not 200 + skeleton).
 */
export default async function RunLayout({ children, params }: RunLayoutProps) {
  const { id } = await params;
  const run = await getCachedRunPageView(id);
  if (!run) {
    notFound();
  }

  return children;
}
