"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Remounts children when navigating back to `/` so CSS enter animations replay.
 * Arch-review F10: tiny client island; static hero copy stays RSC.
 */
export function LandingHeroMotion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const [motionKey, setMotionKey] = useState(0);

  useEffect(() => {
    if (
      pathname === "/" &&
      previousPathRef.current !== null &&
      previousPathRef.current !== "/"
    ) {
      setMotionKey((key) => key + 1);
    }
    previousPathRef.current = pathname;
  }, [pathname]);

  return <div key={motionKey}>{children}</div>;
}
