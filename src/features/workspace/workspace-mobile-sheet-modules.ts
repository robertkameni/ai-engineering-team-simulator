"use client";

import dynamic from "next/dynamic";

export const SidebarMobileSheet = dynamic(
  () =>
    import("@/features/workspace/sidebar-mobile-sheet").then(
      (module) => module.SidebarMobileSheet,
    ),
  { ssr: false },
);

export const ArtifactsMobileSheet = dynamic(
  () =>
    import("@/features/workspace/artifacts-mobile-sheet").then(
      (module) => module.ArtifactsMobileSheet,
    ),
  { ssr: false },
);
