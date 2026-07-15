import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
  ShieldCheck,
  MessageSquare,
  Clock,
  Box,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardTitle, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { BackupModal } from '@/components/backup/BackupModal'
import { vault } from '@/lib/api'
import { agentLabel, formatBytes, formatDateTime, formatRelative } from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import type { AgentId } from '../../shared/types'

export function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)
  const setBackupProgress = useAppStore((s) => s.setBackupProgress)
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [backing, setBacking] = useState(false)

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => vault.getProject(id!),
    enabled: Boolean(id),
  })

  const { data: backups } = useQuery({
    queryKey: ['backups', id],
    queryFn: () => vault.getBackups(id),
    enabled: Boolean(id),
  })

  const { data: restorePoints } = useQuery({
    queryKey: ['restorePoints', id],
    queryFn: () => vault.getRestorePoints(id),
    enabled: Boolean(id),
  })

  const runBackup = async (agents: AgentId[]) => {
    if (!project) return
    setBacking(true)
    try {
      setBackupProgress({
        backupId: 'pending',
        projectId: project.id,
        projectName: project.name,
        stage: 'gathering',
        progress: 5,
        message: 'Starting…',
      })
      const unsub = vault.onBackupProgress((p) => {
        setBackupProgress(p)
        if (p.stage === 'complete' || p.stage === 'error') {
          setTimeout(() => setBackupProgress(null), 2000)
          unsub()
          qc.invalidateQueries({ queryKey: ['backups', id] })
          qc.invalidateQueries({ queryKey: ['restorePoints', id] })
        }
      })
      await vault.startBackup(project.id, agents)
      if (!window.agentVault) {
        for (const s of [
          { stage: 'gathering' as const, progress: 25, message: 'Gathering…' },
          { stage: 'encrypting' as const, progress: 70, message: 'Packaging…' },
          { stage: 'complete' as const, progress: 100, message: 'Done' },
        ]) {
          await new Promise((r) => setTimeout(r, 350))
          setBackupProgress({
            backupId: 'demo',
            projectId: project.id,
            projectName: project.name,
            ...s,
          })
        }
        push({
          type: 'success',
          title: 'Backup complete',
          message: `${project.name} · ${agents.map(agentLabel).join(', ')}`,
        })
        setTimeout(() => setBackupProgress(null), 1200)
      }
      setModalOpen(false)
    } catch (err) {
      push({
        type: 'error',
        title: 'Backup failed',
        message: err instanceof Error ? err.message : 'Error',
      })
      setBackupProgress(null)
    } finally {
      setBacking(false)
    }
  }

  if (isLoading) {
    return (
      <div>
        <TopBar title="Project" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div>
        <TopBar title="Project not found" />
        <div className="p-6">
          <Button variant="secondary" onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <TopBar title={project.name} subtitle={project.path} />
      <div className="p-6 max-w-[1100px] space-y-6">
        <Button size="sm" variant="ghost" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Projects
        </Button>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold tracking-tight">{project.name}</h2>
                  {project.protected && <Badge tone="success">Protected</Badge>}
                  {project.framework && <Badge tone="muted">{project.framework}</Badge>}
                </div>
                <p className="text-sm text-white/40 font-mono">{project.path}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setModalOpen(true)}>
                  <HardDriveDownload className="h-4 w-4" />
                  Backup
                </Button>
                <Button variant="secondary" onClick={() => navigate('/restore')}>
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </Button>
                <Button variant="outline" onClick={() => vault.openFolder(project.path)}>
                  <FolderOpen className="h-4 w-4" />
                  Open folder
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  icon: MessageSquare,
                  label: 'Conversations',
                  value: project.chatCount,
                },
                {
                  icon: Box,
                  label: 'History size',
                  value: formatBytes(project.sizeBytes),
                },
                {
                  icon: Clock,
                  label: 'Last opened',
                  value: formatRelative(project.lastOpened),
                },
                {
                  icon: ShieldCheck,
                  label: 'Last backup',
                  value: formatRelative(project.lastBackup),
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-white/35 mb-1.5">
                    <s.icon className="h-3.5 w-3.5" />
                    {s.label}
                  </div>
                  <div className="text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <div className="text-xs text-white/35 mb-2">
                AI tools used on this project
              </div>
              <div className="flex flex-wrap gap-1.5">
                {project.agents.length ? (
                  project.agents.map((a) => (
                    <Badge key={a}>{agentLabel(a)}</Badge>
                  ))
                ) : (
                  <Badge tone="muted">None linked</Badge>
                )}
              </div>
              {project.agents.length > 1 && (
                <p className="text-xs text-white/30 mt-2 leading-relaxed">
                  This project shows up in more than one tool. When you back up,
                  you can choose which tools to include — restore only brings those back.
                </p>
              )}
            </div>
          </Card>
        </motion.div>

        <Card>
          <CardTitle className="mb-1">Restore points</CardTitle>
          <CardDescription className="mb-4">
            Each backup remembers which AI tools you selected.
          </CardDescription>
          <div className="space-y-2">
            {(restorePoints || backups || []).length === 0 ? (
              <p className="text-sm text-white/35 py-6 text-center">
                No restore points yet. Run a backup to create one.
              </p>
            ) : (
              (restorePoints || []).map((rp, i) => (
                <motion.div
                  key={rp.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{rp.label}</span>
                      <Badge tone="muted">{formatDateTime(rp.createdAt)}</Badge>
                    </div>
                    <div className="text-xs text-white/35 mt-0.5">
                      {rp.chatCount} chats · {formatBytes(rp.sizeBytes)} · {rp.computerName}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {rp.agents.map((a) => (
                        <Badge key={a}>{agentLabel(a)}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate('/restore')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </motion.div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle className="mb-1">Backup history</CardTitle>
          <CardDescription className="mb-4">Encrypted archives for this project</CardDescription>
          <div className="space-y-2">
            {(backups || []).map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{formatDateTime(b.createdAt)}</div>
                  <div className="text-xs text-white/35">
                    {formatBytes(b.compressedBytes)} ·{' '}
                    {b.agents.map(agentLabel).join(', ')} ·{' '}
                    archive
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await vault.verifyBackup(b.id)
                    push({
                      type: r.valid ? 'success' : 'error',
                      title: r.valid ? 'Looks good' : 'Integrity failed',
                      message: r.valid
                        ? 'Checksum verified'
                        : r.errors.join(', '),
                    })
                  }}
                >
                  Verify
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <BackupModal
        open={modalOpen}
        project={project}
        loading={backing}
        onClose={() => setModalOpen(false)}
        onConfirm={runBackup}
      />
    </div>
  )
}
