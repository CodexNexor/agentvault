import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  RotateCcw,
  MessageSquare,
  Box,
  Calendar,
  Monitor,
  MapPin,
  CheckCircle2,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { vault } from '@/lib/api'
import {
  agentLabel,
  formatBytes,
  formatDateTime,
} from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import type { RestorePoint } from '../../shared/types'

export function RestorePage() {
  const push = useToastStore((s) => s.push)
  const setRestoreProgress = useAppStore((s) => s.setRestoreProgress)
  const qc = useQueryClient()

  const { data: points, isLoading } = useQuery({
    queryKey: ['restorePoints'],
    queryFn: () => vault.getRestorePoints(),
  })

  const [restoringId, setRestoringId] = useState<string | null>(null)

  /** One-click: auto path from backup, no modal */
  const runRestore = async (rp: RestorePoint) => {
    const dest =
      rp.projectPath ||
      // last resort for older backups without stored path
      null

    if (!dest) {
      push({
        type: 'error',
        title: 'Path not found',
        message:
          'This backup has no saved project path. Back up again once so we can auto-restore next time.',
      })
      return
    }

    setRestoringId(rp.backupId)
    try {
      setRestoreProgress({
        restoreId: 'pending',
        backupId: rp.backupId,
        projectName: rp.projectName,
        stage: 'decrypting',
        progress: 10,
        message: `Restoring to ${dest}…`,
      })

      const unsub = vault.onRestoreProgress((p) => {
        setRestoreProgress(p)
        if (p.stage === 'complete' || p.stage === 'error') {
          setTimeout(() => setRestoreProgress(null), 2000)
          unsub()
        }
      })

      // Empty/undefined target → backend uses original projectPath
      await vault.startRestore(rp.backupId, dest)

      if (!window.agentVault) {
        for (const s of [
          { stage: 'decrypting' as const, progress: 25, message: 'Decrypting…' },
          { stage: 'extracting' as const, progress: 45, message: 'Extracting…' },
          { stage: 'restoring' as const, progress: 65, message: 'Restoring files…' },
          { stage: 'path_repair' as const, progress: 85, message: 'Repairing paths…' },
          { stage: 'complete' as const, progress: 100, message: 'Restore complete' },
        ]) {
          await new Promise((r) => setTimeout(r, 400))
          setRestoreProgress({
            restoreId: 'demo',
            backupId: rp.backupId,
            projectName: rp.projectName,
            ...s,
          })
        }
        push({
          type: 'success',
          title: 'Project restored',
          message: `${rp.projectName} is ready at ${dest}`,
        })
        setTimeout(() => setRestoreProgress(null), 1500)
      } else {
        push({
          type: 'success',
          title: 'Restore started',
          message: `Putting ${rp.projectName} back at ${dest}`,
        })
      }

      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
      qc.invalidateQueries({ queryKey: ['agents'] })
    } catch (err) {
      push({
        type: 'error',
        title: 'Restore failed',
        message: err instanceof Error ? err.message : 'Error',
      })
      setRestoreProgress(null)
    } finally {
      setRestoringId(null)
    }
  }

  const groups = (points || []).reduce<Record<string, RestorePoint[]>>((acc, p) => {
    const label =
      p.label === 'Today' || p.label === 'Yesterday' || p.label === 'Last Week'
        ? p.label
        : 'Earlier'
    if (!acc[label]) acc[label] = []
    acc[label].push(p)
    return acc
  }, {})

  const order = ['Today', 'Yesterday', 'Last Week', 'Earlier']

  return (
    <div>
      <TopBar
        title="Restore"
        subtitle="One click — restores to the original project path automatically"
      />
      <div className="p-6 max-w-[1000px] space-y-6">
        <Card className="border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <RotateCcw className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>One-click restore</CardTitle>
              <CardDescription>
                Click Restore — we use the original folder path from the backup,
                put files back, restore the AI tools you selected, and rewrite paths.
                No manual path picking needed.
              </CardDescription>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : !points?.length ? (
          <EmptyState
            icon={RotateCcw}
            title="No restore points"
            description="Back up a project first, then restore points show up here."
          />
        ) : (
          order
            .filter((g) => groups[g]?.length)
            .map((group) => (
              <section key={group}>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-3">
                  {group}
                </h2>
                <div className="space-y-2">
                  {groups[group].map((rp, i) => (
                    <motion.div
                      key={rp.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                    >
                      <Card padding="sm" className="hover:border-white/12 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-semibold">{rp.projectName}</span>
                              {rp.framework && (
                                <Badge tone="muted">{rp.framework}</Badge>
                              )}
                              {rp.projectPath && (
                                <Badge tone="success">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Auto path
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 text-xs text-white/40">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDateTime(rp.createdAt)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {rp.chatCount} chats
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Box className="h-3 w-3" />
                                {formatBytes(rp.sizeBytes)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Monitor className="h-3 w-3" />
                                {rp.computerName}
                              </span>
                            </div>
                            {rp.projectPath && (
                              <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-white/35 font-mono">
                                <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-white/30" />
                                <span className="truncate">{rp.projectPath}</span>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {rp.agents.map((a) => (
                                <Badge key={a}>{agentLabel(a)}</Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            loading={restoringId === rp.backupId}
                            disabled={Boolean(restoringId)}
                            onClick={() => runRestore(rp)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </section>
            ))
        )}
      </div>
    </div>
  )
}
