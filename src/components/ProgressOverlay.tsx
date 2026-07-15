import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '@/stores/app-store'
import { Progress } from '@/components/ui/Progress'
import { Lock, CloudUpload, FolderArchive, ShieldCheck, Sparkles } from 'lucide-react'

const stageIcon = {
  gathering: FolderArchive,
  compressing: FolderArchive,
  encrypting: Lock,
  uploading: CloudUpload,
  verifying: ShieldCheck,
  downloading: CloudUpload,
  decrypting: Lock,
  extracting: FolderArchive,
  restoring: Sparkles,
  path_repair: ShieldCheck,
  rebuilding: Sparkles,
  complete: ShieldCheck,
  error: ShieldCheck,
}

export function ProgressOverlay() {
  const backup = useAppStore((s) => s.backupProgress)
  const restore = useAppStore((s) => s.restoreProgress)

  const active =
    backup && backup.stage !== 'complete' && backup.stage !== 'error'
      ? { kind: 'backup' as const, ...backup }
      : restore && restore.stage !== 'complete' && restore.stage !== 'error'
        ? { kind: 'restore' as const, ...restore }
        : null

  // Only show floating card when there's meaningful mid-operation progress
  // TopBar already shows a slim bar — this is for immersive feedback during long ops
  const showFloating = active && active.progress > 0 && active.progress < 100

  if (!showFloating) return null

  const Icon = stageIcon[active.stage] || Sparkles

  return (
    <AnimatePresence>
      {showFloating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          className="pointer-events-none fixed bottom-6 left-1/2 z-40 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2"
        >
          <div className="glass-strong card-shadow rounded-2xl p-4 pointer-events-auto">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffffff]/15 border border-[#ffffff]/20">
                <Icon className="h-5 w-5 text-[#ffffff]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">
                  {active.kind === 'backup' ? 'Backing up' : 'Restoring'}{' '}
                  {active.projectName}
                </div>
                <div className="text-xs text-white/45 truncate">{active.message}</div>
              </div>
              <div className="text-sm font-semibold text-[#e5e5e5] tabular-nums">
                {Math.round(active.progress)}%
              </div>
            </div>
            <Progress value={active.progress} className="h-2" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
