export function ProductCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 sm:rounded-2xl"
      aria-hidden
    >
      <div className="aspect-[4/3] animate-pulse bg-slate-800 sm:aspect-[16/10]" />
      <div className="space-y-3 p-3 sm:p-5">
        <div className="h-3 w-16 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-800" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 w-14 animate-pulse rounded-md bg-slate-800" />
          <div className="h-6 w-12 animate-pulse rounded-md bg-slate-800" />
        </div>
        <div className="h-7 w-24 animate-pulse rounded bg-slate-800 pt-2" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-800" />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
