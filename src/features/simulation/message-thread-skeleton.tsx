import { Skeleton } from "@/components/ui/skeleton";

export function MessageThreadSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-4 @md/message-thread:gap-8">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="skeleton-shimmer size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="skeleton-shimmer h-4 w-24" />
              <Skeleton className="skeleton-shimmer h-4 w-16" />
            </div>
            <Skeleton className="skeleton-shimmer h-24 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
