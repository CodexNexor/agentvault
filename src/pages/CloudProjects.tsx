import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Cloud,
  RefreshCw,
  Download,
  FolderOpen,
  MapPin,
  Sparkles,
  CheckCircle2,
  Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { vault } from '@/lib/api'
import { agentLabel, formatBytes, formatDateTime, cn } from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import type { CloudBackupEntry } from '../../shared/types'

/**
 * Cloud Projects — backups on Google Drive.
 * One click: download → unzip → project files + all IDE history.
 * No encryption keys / passwords.
 */
export function CloudProjectsPage() {
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)
  const setRestoreProgress = useAppStore((s) => s.setRestoreProgress)
  const qc = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  const { data: google } = useQuery({
    queryKey: ['google'],
    queryFn: () => vault.getGoogleAuth(),
  })

  const {
    data: cloud,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['cloudBackups'],
    queryFn: () => vault.scanDrive(false),
    enabled: Boolean(google?.connected),
    staleTime: 15_000,
  })

  const restoreEverything = async (
    entry: CloudBackupEntry,
    projectFolder?: string | null
  ) => {
    setBusyId(entry.backupId)
    try {
      const dest =
        projectFolder?.trim() ||
        (await vault.getDefaultRestorePath(entry.projectName))

      setRestoreProgress({
        restoreId: 'cloud',
        backupId: entry.backupId,
        projectName: entry.projectName,
        stage: 'downloading',
        progress: 5,
        message: 'Downloading complete backup from Drive…',
      })

      await vault.importFromDrive(entry.backupId)

      const unsub = vault.onRestoreProgress((p) => {
        setRestoreProgress(p)
        if (p.stage === 'complete' || p.stage === 'error') {
          setTimeout(() => setRestoreProgress(null), 2500)
          unsub()
        }
      })

      await vault.startRestore(entry.backupId, dest, {
        projectTargetPath: dest,
        useDownloadsDefault: true,
      })

      push({
        type: 'success',
        title: 'Cloud project restored',
        message: `${entry.projectName} → ${dest}. IDE history installed for ${
          entry.agents.length
            ? entry.agents.map(agentLabel).join(', ')
            : 'tools in the backup'
        }.`,
      })

      await qc.invalidateQueries({ queryKey: ['projects'] })
      await qc.invalidateQueries({ queryKey: ['backups'] })
      await qc.invalidateQueries({ queryKey: ['activity'] })
      await qc.invalidateQueries({ queryKey: ['agents'] })
    } catch (err) {
      push({
        type: 'error',
        title: 'Cloud restore failed',
        message: err instanceof Error ? err.message : 'Error',
      })
      setRestoreProgress(null)
    } finally {
      setBusyId(null)
    }
  }

  const restoreToChosenFolder = async (entry: CloudBackupEntry) => {
    const folder = await vault.selectFolder()
    if (!folder) return
    const dest = `${folder.replace(/\/$/, '')}/${entry.projectName}`
    await restoreEverything(entry, dest)
  }

  if (!google?.connected) {
    return (
      <div>
        <TopBar
          title="Cloud Projects"
          subtitle="Projects backed up to Google Drive"
        />
        <div className="p-6 max-w-[900px]">
          <EmptyState
            icon={Cloud}
            title="Connect Drive to see cloud projects"
            description="Complete Backup uploads full project + IDE history as a plain archive. One click restores everything after a PC reset — no password."
            action={
              <div className="flex flex-wrap gap-2 justify-center">
                <Button onClick={() => navigate('/settings')}>
                  Open Settings (OAuth keys)
                </Button>
                <Button variant="secondary" onClick={() => navigate('/drive')}>
                  Google Drive setup
                </Button>
              </div>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <TopBar
        title="Cloud Projects"
        subtitle="Cloud backups — one click downloads, unzips, restores files + all IDE history"
      />
      <div className="p-6 max-w-[1000px] space-y-6">
        <Card className="border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Automatic cloud restore</CardTitle>
                <CardDescription className="mt-1 max-w-xl">
                  Fast metadata scan of plain ZIP backups on Drive. Click{' '}
                  <strong className="text-white/70">Restore all</strong> — no
                  password. Use <strong className="text-white/70">Remove old encrypted</strong>{' '}
                  only if you still have leftover AES archives to trash.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={isFetching}
                onClick={async () => {
                  // Force fresh Drive list (bypasses 20s cache)
                  await qc.fetchQuery({
                    queryKey: ['cloudBackups'],
                    queryFn: () => vault.scanDrive(true),
                  })
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh cloud list
              </Button>
              <Button
                variant="ghost"
                loading={purging}
                onClick={async () => {
                  setPurging(true)
                  try {
                    const r = await vault.purgeLegacyCloudBackups()
                    push({
                      type: 'success',
                      title: 'Old encrypted backups removed',
                      message: `Deleted ${r.deleted} · kept ${r.kept} plain ZIP`,
                    })
                    await qc.fetchQuery({
                      queryKey: ['cloudBackups'],
                      queryFn: () => vault.scanDrive(true),
                    })
                  } catch (err) {
                    push({
                      type: 'error',
                      title: 'Cleanup failed',
                      message: err instanceof Error ? err.message : 'Error',
                    })
                  } finally {
                    setPurging(false)
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remove old encrypted
              </Button>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : !cloud?.length ? (
          <EmptyState
            icon={Cloud}
            title="No cloud projects yet"
            description="Old encrypted backups were cleared. Run Complete Backup on a project (new plain ZIP), then Refresh. Only ZIP archives appear here."
            action={
              <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
                Scan Drive again
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-white/40">
              {cloud.length} cloud project{cloud.length === 1 ? '' : 's'}
            </div>
            {cloud.map((entry, i) => {
              const busy = busyId === entry.backupId
              return (
                <motion.div
                  key={entry.backupId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                >
                  <Card
                    padding="sm"
                    className={cn(
                      'transition-colors',
                      busy && 'border-white/20 bg-white/[0.04]'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-[15px] font-semibold">
                            {entry.projectName}
                          </h3>
                          <Badge tone="accent">Cloud</Badge>
                          {entry.framework && (
                            <Badge tone="muted">{entry.framework}</Badge>
                          )}
                          {busy && (
                            <Badge tone="success">
                              <CheckCircle2 className="h-3 w-3" />
                              Restoring…
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-white/40">
                          {formatDateTime(entry.createdAt)} ·{' '}
                          {formatBytes(
                            entry.compressedBytes || entry.sizeBytes
                          )}{' '}
                          · {entry.chatCount} chats ·{' '}
                          {entry.computerName || 'unknown PC'}
                        </div>
                        {entry.projectPath && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/30 font-mono">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              Was: {entry.projectPath}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1 mt-2.5">
                          {entry.agents.length ? (
                            entry.agents.map((a) => (
                              <Badge key={a}>{agentLabel(a)}</Badge>
                            ))
                          ) : (
                            <Badge tone="muted">All IDEs in archive</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-[11px] text-white/30 leading-relaxed">
                          Restore all → files in Downloads/AgentVault-Restores/
                          {entry.projectName} · history auto into IDE folders
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          loading={busy}
                          disabled={Boolean(busyId)}
                          onClick={() => restoreEverything(entry)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Restore all
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={Boolean(busyId)}
                          onClick={() => restoreToChosenFolder(entry)}
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          Choose folder…
                        </Button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
