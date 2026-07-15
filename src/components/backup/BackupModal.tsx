import { useEffect, useState } from 'react'
import { Check, HardDriveDownload, Cloud } from 'lucide-react'
import type { AgentId, Project } from '../../../shared/types'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { agentLabel, cn } from '@/lib/utils'

const ALL_AGENT_META: Record<
  AgentId,
  { name: string; blurb: string }
> = {
  codex: { name: 'Codex CLI', blurb: 'Sessions, history & config' },
  opencode: { name: 'OpenCode', blurb: 'Conversations & project data' },
  'claude-code': { name: 'Claude Code', blurb: 'Chats, todos & settings' },
  continue: { name: 'Continue', blurb: 'Index, sessions & config' },
  aider: { name: 'Aider', blurb: 'Chat history & conventions' },
  gemini: { name: 'Gemini CLI', blurb: 'Sessions & project files' },
}

export function BackupModal({
  open,
  project,
  onClose,
  onConfirm,
  onCompleteBackup,
  loading,
}: {
  open: boolean
  project: Project | null
  onClose: () => void
  onConfirm: (agents: AgentId[]) => void
  /** Full project zip + all IDE histories → Drive */
  onCompleteBackup?: () => void
  loading?: boolean
}) {
  const linked = project?.agents ?? []
  const [selected, setSelected] = useState<AgentId[]>([])

  useEffect(() => {
    if (open && project) {
      setSelected([...project.agents])
    }
  }, [open, project])

  const toggle = (id: AgentId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  if (!project) return null

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title="Back up this project"
      description={
        linked.length > 1
          ? `${project.name} was used with multiple AI tools. Pick which ones to include — restore will bring back exactly these.`
          : `We'll package ${project.name} and the AI history linked to it.`
      }
      wide
    >
      <div className="space-y-5">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <div className="text-sm font-medium">{project.name}</div>
          <div className="text-xs text-white/40 font-mono mt-0.5 truncate">
            {project.path}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-xs font-medium uppercase tracking-wider text-white/40">
              AI tools on this project
            </div>
            <button
              type="button"
              className="text-xs text-white/50 hover:text-white transition-colors"
              onClick={() =>
                setSelected(
                  selected.length === linked.length ? [] : [...linked]
                )
              }
            >
              {selected.length === linked.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-2">
            {linked.length === 0 ? (
              <p className="text-sm text-white/45 py-4 text-center">
                No AI tools linked yet. Open this folder with Claude Code, Codex,
                or another supported tool first.
              </p>
            ) : (
              linked.map((id) => {
                const meta = ALL_AGENT_META[id]
                const on = selected.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggle(id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                      on
                        ? 'border-white/25 bg-white/[0.08]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/12'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        on
                          ? 'border-white bg-white text-black'
                          : 'border-white/20 bg-transparent'
                      )}
                    >
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">
                        {meta?.name ?? agentLabel(id)}
                      </div>
                      <div className="text-xs text-white/40">
                        {meta?.blurb ?? 'Agent history & settings'}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <p className="text-[11px] text-white/30 leading-relaxed">
          <strong className="text-white/50">Backup</strong> includes project
          source + selected IDE histories as a plain archive.{' '}
          <strong className="text-white/50">Complete Backup</strong> packs the
          full project + every linked IDE and uploads to Google Drive so a new PC
          can restore with one click — no password.
        </p>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          {onCompleteBackup && (
            <Button
              variant="secondary"
              loading={loading}
              disabled={linked.length === 0}
              onClick={onCompleteBackup}
            >
              <Cloud className="h-4 w-4" />
              Complete Backup
            </Button>
          )}
          <Button
            loading={loading}
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            <HardDriveDownload className="h-4 w-4" />
            Back up {selected.length} tool{selected.length === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
