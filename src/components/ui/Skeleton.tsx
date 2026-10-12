import type { CSSProperties } from "react"

// Skeleton loaders: placeholders with the same size as the content they stand in for, so the page does not jump
// when data arrives. All shapes use the `.skeleton` shimmer (src/index.css), which follows light / dark mode.

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-3" style={{ width: index === lines - 1 && lines > 1 ? "62%" : "100%" }} />
      ))}
    </div>
  )
}

// Screen-reader friendly wrapper: announces "Loading" once, hides the shapes.
export function LoadingRegion({ label = "Loading", children, className = "" }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}...</span>
      {children}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface" aria-hidden="true">
      <Skeleton className="h-24 rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex items-center justify-between pt-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonCardGrid({ count = 3, label = "Loading projects" }: { count?: number; label?: string }) {
  return (
    <LoadingRegion label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => <SkeletonCard key={index} />)}
    </LoadingRegion>
  )
}

export function SkeletonKpis({ count = 6 }: { count?: number }) {
  return (
    <LoadingRegion label="Loading summary" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex gap-3 rounded-xl border border-line bg-surface p-4" aria-hidden="true">
          <Skeleton className="h-7 w-7" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

// Table body rows. Render inside <tbody>.
export function SkeletonRows({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <tr key={row} aria-hidden="true">
          {Array.from({ length: cols }, (_, col) => (
            <td key={col} className="py-3 pr-3">
              <Skeleton className="h-4" style={{ width: col === 0 ? "80%" : `${50 + ((row * 7 + col * 13) % 40)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function SkeletonList({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <LoadingRegion label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3" aria-hidden="true">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function SkeletonPage() {
  return (
    <LoadingRegion label="Loading the page" className="space-y-5 p-6">
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-3 w-96 max-w-full" />
      </div>
      <SkeletonKpis count={3} />
      <Skeleton className="h-64 w-full" />
    </LoadingRegion>
  )
}
