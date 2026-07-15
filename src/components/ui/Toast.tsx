import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'
import { useToastStore } from '@/stores/toast-store'
import { cn } from '@/lib/utils'

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const tones = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-white/80',
  warning: 'text-amber-400',
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="pointer-events-auto glass-strong card-shadow rounded-2xl p-4 flex gap-3"
            >
              <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', tones[t.type])} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">{t.title}</div>
                <div className="text-xs text-white/50 mt-0.5 leading-relaxed">
                  {t.message}
                </div>
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
