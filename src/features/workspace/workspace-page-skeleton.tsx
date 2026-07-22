import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading shell matching AppShellFrame columns (arch-review F5).
 * Used by workspace/runs loading.tsx and Suspense fallbacks.
 */
export function WorkspacePageSkeleton() {
  return (
    <div
      className="@container/app-shell ambient-mesh relative flex h-svh flex-col overflow-hidden"
      aria-busy="true"
      aria-label="Loading workspace"
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden min-[720px]:flex-row">
        <aside className="glass-panel hidden h-full w-64 shrink-0 flex-col border-r min-[720px]:flex">
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="skeleton-shimmer h-8 w-32" />
            <Skeleton className="skeleton-shimmer h-9 w-full rounded-lg" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="skeleton-shimmer h-10 w-full rounded-lg"
                />
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <Skeleton className="skeleton-shimmer h-6 w-48" />
            <Skeleton className="skeleton-shimmer ml-auto h-8 w-20 rounded-full" />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="skeleton-shimmer size-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="skeleton-shimmer h-4 w-28" />
                  <Skeleton className="skeleton-shimmer h-24 w-full rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="glass-panel hidden h-full w-80 shrink-0 flex-col border-l min-[1100px]:flex">
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="skeleton-shimmer h-6 w-36" />
            <Skeleton className="skeleton-shimmer h-8 w-full rounded-lg" />
            <Skeleton className="skeleton-shimmer h-40 w-full rounded-xl" />
            <Skeleton className="skeleton-shimmer h-40 w-full rounded-xl" />
          </div>
        </aside>
      </div>
    </div>
  );
}

export function SidebarRunsSkeleton() {
  return (
    <aside
      className="@container/sidebar glass-panel hidden h-full w-full shrink-0 flex-col border-r-0 min-[720px]:flex min-[720px]:w-64 min-[720px]:border-r"
      aria-busy="true"
      aria-label="Loading recent runs"
    >
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="skeleton-shimmer h-8 w-32" />
        <Skeleton className="skeleton-shimmer h-9 w-full rounded-lg" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className="skeleton-shimmer h-10 w-full rounded-lg"
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
