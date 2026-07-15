import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Clock,
  Cloud,
  Lock,
  Zap,
  RefreshCw,
  FolderKanban,
  MessageSquare,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { AgentCard } from '@/components/agents/AgentCard'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { vault } from '@/lib/api'
import { cloudLabel, formatBytes, formatRelative } from '@/lib/utils'
import { useToastStore } from '@/stores/toast-store'

export function DashboardPage() {
  const push = useToastStore((s) => s.push)

  const { data: dashboard, isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => vault.getDashboard(),
  })

  const {
    data: agents,
    isLoading: agentsLoading,
    refetch: rescanAgents,
    isFetching: agentsFetching,
  } = useQuery({
    queryKey: ['agents'],
    queryFn: () => vault.getAgents(),
  })

  const {
    data: projects,
    isLoading: projectsLoading,
    refetch: rescanProjects,
    isFetching: projectsFetching,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: () => vault.getProjects(),
  })

  const statusItems = [
    {
      label: 'Status',
      value: dashboard?.protected ? 'Protected' : 'Unprotected',
      icon: ShieldCheck,
      tone: dashboard?.protected ? 'success' : 'warning',
    },
    {
      label: 'Last Backup',
      value: formatRelative(dashboard?.lastBackup),
      icon: Clock,
      tone: 'default',
    },
    {
      label: 'Cloud Storage',
      value: cloudLabel(dashboard?.cloudStorage || 'none'),
      icon: Cloud,
      tone: dashboard?.cloudStorage === 'google-drive' ? 'accent' : 'muted',
    },
    {
      label: 'Encryption',
      value: dashboard?.encryptionEnabled ? 'Enabled' : 'Off',
      icon: Lock,
      tone: dashboard?.encryptionEnabled ? 'success' : 'danger',
    },
    {
      label: 'Auto Backup',
      value: dashboard?.autoBackup ? 'ON' : 'OFF',
      icon: Zap,
      tone: dashboard?.autoBackup ? 'accent' : 'muted',
    },
  ] as const

  const handleScan = async () => {
    await Promise.all([rescanAgents(), rescanProjects()])
    // Force full scan in electron
    if (window.agentVault) {
      await vault.scanAgents()
      await vault.scanProjects()
      await rescanAgents()
      await rescanProjects()
    }
    push({ type: 'info', title: 'Scan complete', message: 'AI tools and projects refreshed.' })
  }

  return (
    <div>
      <TopBar title="Dashboard" subtitle="Your AI coding workspaces at a glance" />

      <div className="p-6 space-y-8 max-w-[1400px]">
        {/* Status section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white/90">How protected you are</h2>
              <p className="text-xs text-white/35 mt-0.5">
                A quick look at backups, encryption, and cloud on this machine
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={agentsFetching || projectsFetching}
              onClick={handleScan}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rescan
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            {dashLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))
              : statusItems.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="h-full">
                      <div className="flex items-center justify-between mb-3">
                        <item.icon className="h-4 w-4 text-white/35" />
                        <Badge
                          tone={
                            item.tone === 'default'
                              ? 'default'
                              : (item.tone as 'success' | 'warning' | 'accent' | 'muted' | 'danger')
                          }
                        >
                          {item.label === 'Status' || item.label === 'Auto Backup'
                            ? item.value
                            : item.tone === 'success'
                              ? 'OK'
                              : item.tone === 'accent'
                                ? 'Active'
                                : '—'}
                        </Badge>
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">
                        {item.label}
                      </div>
                      <div className="text-[15px] font-semibold tracking-tight truncate">
                        {item.value}
                      </div>
                    </Card>
                  </motion.div>
                ))}
          </div>

          {/* Quick stats */}
          {!dashLoading && dashboard && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  icon: FolderKanban,
                  label: 'Projects',
                  value: dashboard.projectCount,
                },
                {
                  icon: MessageSquare,
                  label: 'Conversations',
                  value: dashboard.totalConversations,
                },
                {
                  icon: ShieldCheck,
                  label: 'AI Tools',
                  value: dashboard.agentCount,
                },
                {
                  icon: Cloud,
                  label: 'Backup size',
                  value: formatBytes(dashboard.totalBackupSize),
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3"
                >
                  <s.icon className="h-4 w-4 text-[#ffffff]" />
                  <div>
                    <div className="text-[11px] text-white/35">{s.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{s.value}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Agents */}
        <section>
          <CardHeader className="mb-3 px-0">
            <div>
              <CardTitle>AI tools we found</CardTitle>
              <CardDescription>
                Scanned from the usual install folders on your machine
              </CardDescription>
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {agentsLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 rounded-2xl" />
                ))
              : agents?.map((agent, i) => (
                  <AgentCard key={agent.id} agent={agent} index={i} />
                ))}
          </div>
        </section>

        {/* Projects */}
        <section>
          <CardHeader className="mb-3 px-0">
            <div>
              <CardTitle>Projects with AI history</CardTitle>
              <CardDescription>
                Only folders that actually ran in Claude Code, Codex, and other tools
              </CardDescription>
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projectsLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-2xl" />
                ))
              : projects?.slice(0, 4).map((p, i) => (
                  <ProjectCard key={p.id} project={p} index={i} />
                ))}
          </div>
        </section>
      </div>
    </div>
  )
}
