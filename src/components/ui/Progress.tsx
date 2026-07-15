import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number
  className?: string
  barClassName?: string
}) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]',
        className
      )}
    >
      <motion.div
        className={cn('h-full rounded-full bg-white', barClassName)}
        initial={{ width: 0 }}
        animate={{ width: `${v}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}
