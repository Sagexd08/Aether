import { cn } from '@/lib/utils'

export function SkeletonBlock({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-2xl', className)}
      style={style}
    />
  )
}

export function SkeletonText({ lines = 2, className }: { lines?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass-panel rounded-[26px] p-5', className)}>
      <SkeletonBlock className="mb-4 h-4 w-1/3" />
      <SkeletonText lines={2} />
      <div className="mt-5 flex gap-2">
        <SkeletonBlock className="h-8 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <SkeletonBlock
      className={cn('shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
    />
  )
}
