import { Skeleton } from "@/components/ui/skeleton";

export function ArtifactPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-4 gap-1.5 @max-sm/artifact-panel:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="skeleton-shimmer h-8 rounded-md" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="glass-card space-y-2 rounded-xl p-3">
          <Skeleton className="skeleton-shimmer h-3 w-28" />
          <Skeleton className="skeleton-shimmer h-3 w-full" />
          <Skeleton className="skeleton-shimmer h-3 w-[92%]" />
          <Skeleton className="skeleton-shimmer h-3 w-[85%]" />
        </div>
      ))}
    </div>
  );
}
