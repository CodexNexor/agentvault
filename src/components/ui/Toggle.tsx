import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
  description?: string
}

export function Toggle({ checked, onChange, disabled, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex w-full items-center justify-between gap-4 text-left disabled:opacity-40',
        !label && 'w-auto'
      )}
    >
      {(label || description) && (
        <div className="min-w-0">
          {label && <div className="text-sm font-medium text-white">{label}</div>}
          {description && (
            <div className="text-xs text-white/40 mt-0.5 leading-relaxed">{description}</div>
          )}
        </div>
      )}
      <div
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-white' : 'bg-white/15'
        )}
      >
        <motion.div
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow-md',
            checked ? 'bg-black' : 'bg-white'
          )}
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    </button>
  )
}
