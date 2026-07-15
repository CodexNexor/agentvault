import { Search, Command } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/stores/app-store'
import { Progress } from '@/components/ui/Progress'

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate()
  const setCommandOpen = useAppStore((s) => s.setCommandOpen)
  const backupProgress = useAppStore((s) => s.backupProgress)
  const restoreProgress = useAppStore((s) => s.restoreProgress)

  const active = backupProgress || restoreProgress

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-[#090909]/70 backdrop-blur-xl">
      <div className="drag-region flex h-14 items-center justify-between gap-4 px-6">
        <div className="no-drag min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-white/40 truncate">{subtitle}</p>
          )}
        </div>

        <button
          onClick={() => {
            setCommandOpen(true)
            navigate('/search')
          }}
          className="no-drag group flex h-9 w-full max-w-xs items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 text-left text-sm text-white/35 hover:border-white/10 hover:bg-white/[0.05] transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">Search projects, chats…</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/30">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>
      </div>

      {active && active.stage !== 'complete' && active.stage !== 'error' && (
        <div className="px-6 pb-3">
          <div className="flex items-center justify-between text-[11px] text-white/45 mb-1.5">
            <span>
              {'projectName' in active ? active.projectName : ''} · {active.message}
            </span>
            <span className="text-[#e5e5e5] font-medium">{Math.round(active.progress)}%</span>
          </div>
          <Progress value={active.progress} />
        </div>
      )}
    </header>
  )
}
