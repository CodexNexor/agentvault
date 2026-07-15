import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Activity as ActivityIcon,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  Trash2,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { vault } from '@/lib/api'
import { formatDateTime, cn } from '@/lib/utils'
import type { ActivityEvent } from '../../shared/types'

const levelIcon = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

const levelColor = {
  info: 'text-[#e5e5e5] bg-[#ffffff]/12 border-[#ffffff]/20',
  success: 'text-emerald-400 bg-emerald-500/12 border-emerald-500/20',
  warning: 'text-amber-400 bg-amber-500/12 border-amber-500/20',
  error: 'text-red-400 bg-red-500/12 border-red-500/20',
}

export function ActivityPage() {
  const qc = useQueryClient()
  const { data: events, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => vault.getActivity(200),
  })

  const clear = async () => {
    await vault.clearActivity()
    await qc.invalidateQueries({ queryKey: ['activity'] })
  }

  return (
    <div>
      <TopBar title="Activity" subtitle="Everything timestamped" />
      <div className="p-6 max-w-[800px]">
        <div className="flex justify-end mb-4">
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 className="h-3.5 w-3.5" />
            Clear timeline
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : !events?.length ? (
          <EmptyState
            icon={ActivityIcon}
            title="No activity yet"
            description="Backups, restores, scans, and conversation changes will appear here."
          />
        ) : (
          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-white/[0.06]" />
            <div className="space-y-3">
              {events.map((e, i) => (
                <TimelineItem key={e.id} event={e} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TimelineItem({ event, index }: { event: ActivityEvent; index: number }) {
  const Icon = levelIcon[event.level] || Info
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="relative flex gap-4 pl-0"
    >
      <div
        className={cn(
          'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
          levelColor[event.level]
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <Card padding="sm" className="flex-1 !py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{event.title}</div>
            <div className="text-xs text-white/45 mt-0.5 leading-relaxed">
              {event.message}
            </div>
            {event.projectName && (
              <div className="text-[11px] text-[#e5e5e5]/80 mt-1">
                {event.projectName}
              </div>
            )}
          </div>
          <time className="text-[11px] text-white/30 whitespace-nowrap tabular-nums">
            {formatDateTime(event.timestamp)}
          </time>
        </div>
      </Card>
    </motion.div>
  )
}
