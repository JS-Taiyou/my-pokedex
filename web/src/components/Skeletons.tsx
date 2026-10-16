import { Skeleton } from '@/components/ui/skeleton'

/** Grid of ghost cards shown while the list query is in flight. */
export function CardGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-3 rounded-xl border p-4">
          <Skeleton className="size-28 rounded-full" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Full-page ghost for the detail view. This is also exactly what the user
 * sees while the backend enriches a cache miss from PokeAPI — the request
 * simply takes a few seconds on first visit.
 */
export function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-8 w-44" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex items-center justify-center rounded-2xl border bg-muted/30 p-8">
          <Skeleton className="size-64 rounded-full sm:size-72" />
        </div>
        <div className="space-y-6">
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2.5 w-full rounded-full" />
              <Skeleton className="h-4 w-8 justify-self-end" />
            </div>
          ))}
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
