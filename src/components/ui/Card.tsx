import { type HTMLAttributes, forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean
  glow?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover, glow, padding = 'md', children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
        className={cn(
          'rounded-2xl bg-[#141414] border border-white/[0.05] card-shadow',
          hover && 'hover:bg-[#1a1a1a] hover:border-white/[0.08] hover:card-shadow-hover transition-colors duration-200 cursor-pointer',
          glow && 'glow-accent',
          paddings[padding],
          className
        )}
        {...(props as HTMLMotionProps<'div'>)}
      >
        {children}
      </motion.div>
    )
  }
)
Card.displayName = 'Card'

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex items-start justify-between gap-3', className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[15px] font-semibold tracking-tight text-white', className)}
      {...props}
    />
  )
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-white/45 mt-0.5', className)} {...props} />
  )
}
