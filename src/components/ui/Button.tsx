import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-white text-black hover:bg-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.15),0_4px_16px_rgba(0,0,0,0.35)]',
  secondary:
    'bg-white/[0.07] text-white hover:bg-white/[0.11] border border-white/[0.08]',
  ghost: 'bg-transparent text-white/65 hover:text-white hover:bg-white/[0.06]',
  danger:
    'bg-red-500/12 text-red-300 hover:bg-red-500/20 border border-red-500/20',
  outline:
    'bg-transparent border border-white/12 text-white hover:bg-white/[0.04] hover:border-white/22',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-12 px-6 text-[15px] rounded-xl gap-2.5',
  icon: 'h-9 w-9 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: disabled || loading ? 1 : 1.015 }}
        whileTap={{ scale: disabled || loading ? 1 : 0.985 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none select-none',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...(props as HTMLMotionProps<'button'>)}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </motion.button>
    )
  }
)
Button.displayName = 'Button'
