import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'

const tones: Record<Tone, string> = {
  default: 'bg-white/[0.07] text-white/80 border-white/[0.08]',
  accent: 'bg-white text-black border-white/20',
  success: 'bg-lime-400/12 text-lime-300 border-lime-400/20',
  warning: 'bg-amber-400/12 text-amber-300 border-amber-400/20',
  danger: 'bg-red-400/12 text-red-300 border-red-400/20',
  muted: 'bg-white/[0.04] text-white/40 border-white/[0.05]',
}

export function Badge({
  className,
  tone = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide',
        tones[tone],
        className
      )}
      {...props}
    />
  )
}
