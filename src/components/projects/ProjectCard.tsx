import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FolderOpen,
  HardDriveDownload,
  RotateCcw,
  Settings2,
  MessageSquare,
  Clock,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AgentId, Project } from '../../../shared/types'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { BackupModal } from '@/components/backup/BackupModal'
import { agentLabel, formatBytes, formatRelative, cn } from '@/lib/utils'
import { vault } from '@/lib/api'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import { useQueryClient } from '@tanstack/react-query'

export function ProjectCard({
  project,
  index = 0,
}: {
  project: Project
  index?: number
}) {
  const navigate = useNavigate()
  const push = useToastStore((s) => s.push)
  const setBackupProgress = useAppStore((s) => s.setBackupProgress)
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [backing, setBacking] = useState(false)

  const watchBackup = () => {
    const unsub = vault.onBackupProgress((p) => {
      setBackupProgress(p)
      if (p.stage === 'complete' || p.stage === 'error') {
        setTimeout(() => setBackupProgress(null), 2000)
        unsub()
        qc.invalidateQueries({ queryKey: ['backups'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['activity'] })
        qc.invalidateQueries({ queryKey: ['projects'] })
        qc.invalidateQueries({ queryKey: ['cloudBackups'] })
      }
    })
    return unsub
  }

  const runBackup = async (agents: AgentId[]) => {
    setBacking(true)
    try {
      setBackupProgress({
        backupId: 'pending',
        projectId: project.id,
        projectName: project.name,
        stage: 'gathering',
        progress: 5,
        message: 'Starting backup…',
      })
      watchBackup()
      await vault.startBackup(project.id, agents)
      setModalOpen(false)
    } catch (err) {
      push({
        type: 'error',
        title: 'Backup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
      setBackupProgress(null)
    } finally {
      setBacking(false)
    }
  }

  const runCompleteBackup = async () => {
    setBacking(true)
    try {
      setBackupProgress({
        backupId: 'pending',
        projectId: project.id,
        projectName: project.name,
        stage: 'gathering',
        progress: 5,
        message: 'Complete backup: project files + all IDE histories → Drive…',
      })
      watchBackup()
      await vault.completeBackup(project.id)
      push({
        type: 'success',
        title: 'Complete backup finished',
        message: `${project.name} · full project + all tools ready for Drive recovery`,
      })
      setModalOpen(false)
    } catch (err) {
      push({
        type: 'error',
        title: 'Complete backup failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      })
      setBackupProgress(null)
    } finally {
      setBacking(false)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35 }}
      >
        <Card
          hover
          className="group"
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-[15px] font-semibold truncate">{project.name}</h3>
                {project.protected && <Badge tone="success">Protected</Badge>}
              </div>
              <p className="text-xs text-white/35 font-mono truncate">{project.path}</p>
            </div>
            {project.framework && (
              <Badge tone="muted">{project.framework}</Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.agents.map((a) => (
              <Badge key={a}>{agentLabel(a)}</Badge>
            ))}
            {project.agents.length > 1 && (
              <Badge tone="accent">{project.agents.length} tools</Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5 text-xs">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
              <div className="flex items-center gap-1 text-white/35 mb-1">
                <MessageSquare className="h-3 w-3" />
                Chats
              </div>
              <div className="font-semibold tabular-nums">{project.chatCount}</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
              <div className="text-white/35 mb-1">Size</div>
              <div className="font-semibold tabular-nums">
                {formatBytes(project.sizeBytes)}
              </div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
              <div className="flex items-center gap-1 text-white/35 mb-1">
                <Clock className="h-3 w-3" />
                Opened
              </div>
              <div className="font-semibold text-[11px] truncate">
                {formatRelative(project.lastOpened)}
              </div>
            </div>
          </div>

          <div
            className={cn('flex flex-wrap gap-2')}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              <HardDriveDownload className="h-3.5 w-3.5" />
              Backup
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/restore')}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => vault.openFolder(project.path)}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      </motion.div>

      <BackupModal
        open={modalOpen}
        project={project}
        loading={backing}
        onClose={() => setModalOpen(false)}
        onConfirm={runBackup}
        onCompleteBackup={runCompleteBackup}
      />
    </>
  )
}
