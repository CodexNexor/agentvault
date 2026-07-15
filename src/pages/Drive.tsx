import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Cloud,
  RefreshCw,
  RotateCcw,
  FolderOpen,
  HardDriveDownload,
  MapPin,
  Link2,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { vault } from '@/lib/api'
import { agentLabel, formatBytes, formatDateTime } from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import type { CloudBackupEntry } from '../../shared/types'

/**
 * Fresh PC recovery:
 * Connect Drive → Scan Drive → pick project → choose folder for source files
 * → Restore (IDE history goes to Claude/Codex/etc automatically).
 */
export function DrivePage() {
  const push = useToastStore((s) => s.push)
  const setRestoreProgress = useAppStore((s) => s.setRestoreProgress)
  const qc = useQueryClient()

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
    staleTime: 15_000,
    enabled: Boolean(google?.connected),
  })

  const [selected, setSelected] = useState<CloudBackupEntry | null>(null)
  const [targetPath, setTargetPath] = useState('')
  const [busy, setBusy] = useState(false)

  const connect = async () => {
    try {
      const s = await vault.getSettings()
      if (!s.googleClientId || !s.googleClientSecret) {
        push({
          type: 'info',
          title: 'Add your Google OAuth keys first',
          message: 'Settings → paste Desktop Client ID + Client secret, then Connect.',
        })
        window.location.hash = '#/settings'
        return
      }
      await vault.connectGoogle()
      await qc.invalidateQueries({ queryKey: ['google'] })
      await qc.invalidateQueries({ queryKey: ['settings'] })
      push({
        type: 'success',
        title: 'Google Drive connected',
        message: 'You can scan for complete backups from any machine.',
      })
      await refetch()
    } catch (err) {
      push({
        type: 'error',
        title: 'Connect failed',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  const openRestore = async (entry: CloudBackupEntry) => {
    setSelected(entry)
    const def = await vault.getDefaultRestorePath(entry.projectName)
    setTargetPath(def)
  }

  const pickFolder = async () => {
    const folder = await vault.selectFolder()
    if (folder) setTargetPath(folder)
  }

  const runRestore = async () => {
    if (!selected || !targetPath.trim()) return
    setBusy(true)
    try {
      // Import from Drive into local cache if needed
      setRestoreProgress({
        restoreId: 'pending',
        backupId: selected.backupId,
        projectName: selected.projectName,
        stage: 'downloading',
        progress: 8,
        message: 'Downloading complete backup from Drive…',
      })
      await vault.importFromDrive(selected.backupId)

      const unsub = vault.onRestoreProgress((p) => {
        setRestoreProgress(p)
        if (p.stage === 'complete' || p.stage === 'error') {
          setTimeout(() => setRestoreProgress(null), 2500)
          unsub()
        }
      })

      await vault.startRestore(selected.backupId, targetPath, {
        projectTargetPath: targetPath,
        useDownloadsDefault: false,
      })

      push({
        type: 'success',
        title: 'Restore running',
        message: `Project files → ${targetPath}. IDE histories auto-installed for ${
          selected.agents.map(agentLabel).join(', ') || 'tools in backup'
        }.`,
      })
      setSelected(null)
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['backups'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    } catch (err) {
      push({
        type: 'error',
        title: 'Restore failed',
        message: err instanceof Error ? err.message : 'Error',
      })
      setRestoreProgress(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <TopBar
        title="Google Drive"
        subtitle="After a PC reset — connect Drive, scan, restore projects + all IDE history"
      />
      <div className="p-6 max-w-[1000px] space-y-6">
        <Card className="border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Recover on a new computer</CardTitle>
                <CardDescription className="mt-1 max-w-xl">
                  1) In Settings, paste your Google Desktop Client ID + secret ·
                  2) Connect Google Drive · 3) Scan Drive · 4) Restore.
                  Project files go where you choose (default Downloads). IDE history
                  is restored into Codex / Claude / etc. automatically.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!google?.connected ? (
                <Button onClick={connect}>
                  <Link2 className="h-4 w-4" />
                  Connect Google Drive
                </Button>
              ) : (
                <>
                  <Badge tone="success">Connected · {google.email || 'Drive'}</Badge>
                  <Button
                    variant="secondary"
                    loading={isFetching}
                    onClick={() => refetch()}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Scan Drive
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        {!google?.connected ? (
          <EmptyState
            icon={Cloud}
            title="Connect Drive to recover"
            description="After a wipe, your complete backups live in Google Drive under AgentVault/Backups. Connect to list every project you uploaded."
            action={
              <Button onClick={connect}>Connect Google Drive</Button>
            }
          />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : !cloud?.length ? (
          <EmptyState
            icon={HardDriveDownload}
            title="No complete backups on Drive yet"
            description="On your old machine, open a project → Complete Backup. That uploads full project files + all linked IDE histories. Then Scan Drive here."
            action={
              <Button variant="secondary" loading={isFetching} onClick={() => refetch()}>
                Scan again
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-white/40 mb-2">
              {cloud.length} complete backup{cloud.length === 1 ? '' : 's'} on Drive
            </div>
            {cloud.map((entry, i) => (
              <motion.div
                key={entry.backupId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold">{entry.projectName}</span>
                        {entry.framework && <Badge tone="muted">{entry.framework}</Badge>}
                        <Badge tone="accent">Drive</Badge>
                      </div>
                      <div className="text-xs text-white/40">
                        {formatDateTime(entry.createdAt)} · {formatBytes(entry.compressedBytes || entry.sizeBytes)} ·{' '}
                        {entry.chatCount} chats · {entry.computerName || 'unknown PC'}
                      </div>
                      {entry.projectPath && (
                        <div className="mt-1 text-[11px] text-white/30 font-mono flex gap-1 items-center">
                          <MapPin className="h-3 w-3" />
                          Original: {entry.projectPath}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.agents.length ? (
                          entry.agents.map((a) => (
                            <Badge key={a}>{agentLabel(a)}</Badge>
                          ))
                        ) : (
                          <Badge tone="muted">All tools in archive</Badge>
                        )}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => openRestore(entry)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => !busy && setSelected(null)}
        title="Restore from Drive"
        description="Choose where project source files go. IDE chat history is applied automatically to Codex, Claude Code, OpenCode, etc."
        wide
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Project', value: selected.projectName },
                {
                  label: 'AI tools',
                  value: selected.agents.map(agentLabel).join(', ') || 'In archive',
                },
                { label: 'Date', value: formatDateTime(selected.createdAt) },
                {
                  label: 'Size',
                  value: formatBytes(selected.compressedBytes || selected.sizeBytes),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                >
                  <div className="text-[11px] text-white/35 mb-0.5">{row.label}</div>
                  <div className="text-sm font-medium truncate">{row.value}</div>
                </div>
              ))}
            </div>

            <div>
              <label className="text-xs text-white/45 mb-1.5 block">
                Project files folder (source code)
              </label>
              <div className="flex gap-2">
                <Input
                  value={targetPath}
                  onChange={(e) => setTargetPath(e.target.value)}
                  placeholder="~/Downloads/AgentVault-Restores/…"
                />
                <Button variant="secondary" onClick={pickFolder}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-white/30 mt-2 leading-relaxed">
                Default is Downloads/AgentVault-Restores. Pick any folder you want.
                Chat databases for Codex, Claude Code, OpenCode, Continue, Aider, Gemini
                are restored into their normal home directories automatically.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button loading={busy} disabled={!targetPath.trim()} onClick={runRestore}>
                <RotateCcw className="h-4 w-4" />
                Download & restore
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
