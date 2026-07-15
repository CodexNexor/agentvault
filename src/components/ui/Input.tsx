import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-white/30',
        'transition-colors focus:border-white/40 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-white/15',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
