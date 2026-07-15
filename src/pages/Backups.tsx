import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  HardDrive,
  Download,
  Upload,
  ShieldCheck,
  Cloud,
  Import,
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
  formatRelative,
} from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'

export function BackupsPage() {
  const push = useToastStore((s) => s.push)
  const qc = useQueryClient()

  const { data: backups, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: () => vault.getBackups(),
  })

  const { data: analytics } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => vault.getStorageAnalytics(),
  })

  const maxHistory = Math.max(
    ...(analytics?.history.map((h) => h.bytes) || [1]),
    1
  )

  const handleImport = async () => {
    const file = await vault.selectFile()
    if (!file) return
    try {
      await vault.importBackup(file)
      await qc.invalidateQueries({ queryKey: ['backups'] })
      push({
        type: 'success',
        title: 'Backup Imported',
        message: 'Encrypted backup is ready to restore.',
      })
    } catch (err) {
      push({
        type: 'error',
        title: 'Import failed',
        message: err instanceof Error ? err.message : 'Error',
      })
    }
  }

  return (
    <div>
      <TopBar title="Backups" subtitle="Encrypted archives & storage analytics" />
      <div className="p-6 max-w-[1200px] space-y-6">
        {/* Analytics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Local storage',
              value: formatBytes(analytics?.totalLocalBytes),
              icon: HardDrive,
            },
            {
              label: 'Cloud storage',
              value: formatBytes(analytics?.totalCloudBytes),
              icon: Cloud,
            },
            {
              label: 'Backups',
              value: analytics?.backupCount ?? '—',
              icon: ShieldCheck,
            },
            {
              label: 'Avg compression',
              value: analytics
                ? `${Math.round(analytics.averageCompressionRatio * 100)}%`
                : '—',
              icon: Download,
            },
          ].map((s) => (
            <Card key={s.label} padding="sm">
              <div className="flex items-center gap-2 text-white/35 mb-2">
                <s.icon className="h-3.5 w-3.5" />
                <span className="text-[11px] uppercase tracking-wider">{s.label}</span>
              </div>
              <div className="text-lg font-semibold tabular-nums">{s.value}</div>
            </Card>
          ))}
        </div>

        {/* Size graph */}
        {analytics && (
          <Card>
            <CardTitle className="mb-1">Backup size graph</CardTitle>
            <CardDescription className="mb-4">Last 14 days</CardDescription>
            <div className="flex items-end gap-1.5 h-28">
              {analytics.history.map((h) => (
                <div key={h.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{
                      height: `${Math.max(4, (h.bytes / maxHistory) * 100)}%`,
                    }}
                    className="w-full rounded-t-md bg-gradient-to-t from-white/30 to-white min-h-[4px]"
                    title={`${h.date}: ${formatBytes(h.bytes)}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-white/25">
              <span>{analytics.history[0]?.date}</span>
              <span>{analytics.history[analytics.history.length - 1]?.date}</span>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">All backups</h2>
          <Button size="sm" variant="secondary" onClick={handleImport}>
            <Import className="h-3.5 w-3.5" />
            Import backup
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : !backups?.length ? (
          <EmptyState
            icon={HardDrive}
            title="No backups yet"
            description="Back up a project from the Dashboard or Projects page to create your first encrypted archive."
          />
        ) : (
          <div className="space-y-2">
            {backups.map((b, i) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card padding="sm" hover className="!cursor-default">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold">{b.projectName}</span>
                        {b.encrypted && <Badge tone="success">Encrypted</Badge>}
                        <Badge tone={b.location === 'both' ? 'accent' : 'muted'}>
                          {b.location === 'both'
                            ? 'Local + Cloud'
                            : b.location === 'cloud'
                              ? 'Cloud'
                              : 'Local'}
                        </Badge>
                      </div>
                      <div className="text-xs text-white/40">
                        {formatDateTime(b.createdAt)} · {formatBytes(b.compressedBytes)} ·{' '}
                        {b.chatCount} chats · {b.computerName}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {b.agents.map((a) => (
                          <Badge key={a}>{agentLabel(a)}</Badge>
                        ))}
                        {b.framework && <Badge tone="accent">{b.framework}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          const r = await vault.verifyBackup(b.id)
                          push({
                            type: r.valid ? 'success' : 'error',
                            title: r.valid ? 'Integrity check passed' : 'Integrity check failed',
                            message: r.valid
                              ? `Checksum match · ${formatRelative(b.createdAt)}`
                              : r.errors.join(', '),
                          })
                        }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const folder = await vault.selectFolder()
                          if (!folder) return
                          await vault.exportBackup(
                            b.id,
                            `${folder}/${b.projectName}-${b.id.slice(0, 8)}.avault`
                          )
                          push({
                            type: 'success',
                            title: 'Exported',
                            message: 'Encrypted .avault file saved.',
                          })
                        }}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Export
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
