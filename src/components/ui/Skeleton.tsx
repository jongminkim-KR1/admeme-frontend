export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse bg-[var(--color-bg-muted)] rounded ${className}`}
      style={style}
    />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-2xl p-6">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-12 h-12 rounded-xl" />
        <Skeleton className="w-12 h-5 rounded-full" />
      </div>
      <Skeleton className="w-20 h-4 mb-2" />
      <Skeleton className="w-24 h-8" />
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Skeleton className="w-24 h-5 mb-2" />
          <Skeleton className="w-16 h-4" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="w-10 h-7 rounded-lg" />
          <Skeleton className="w-10 h-7 rounded-lg" />
          <Skeleton className="w-10 h-7 rounded-lg" />
        </div>
      </div>
      <div className="h-64 flex items-end justify-between gap-2 px-4">
        {[40, 65, 45, 80, 55, 70, 60].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

export function VideoCardSkeleton() {
  return (
    <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="p-4">
        <Skeleton className="h-4 w-3/4 mb-2" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] flex gap-2">
          <Skeleton className="flex-1 h-8 rounded-md" />
          <Skeleton className="w-9 h-8 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export function VideoRowSkeleton() {
  return (
    <div className="flex items-center justify-between p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
      <div className="flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-lg" />
        <div>
          <Skeleton className="w-32 h-4 mb-2" />
          <Skeleton className="w-20 h-3" />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <Skeleton className="w-16 h-4 mb-1" />
          <Skeleton className="w-10 h-3" />
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
    </div>
  )
}

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  }

  return (
    <div
      className={`${sizeClasses[size]} border-[var(--gradient-1)] border-t-transparent rounded-full animate-spin`}
    />
  )
}
