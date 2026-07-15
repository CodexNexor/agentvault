import { motion } from 'framer-motion'
import { Check, X, Folder, MessageSquare, Box } from 'lucide-react'
import type { DetectedAgent } from '../../../shared/types'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export function AgentCard({
  agent,
  index = 0,
}: {
  agent: DetectedAgent
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        padding="sm"
        className={cn(
          'h-full transition-all',
          agent.installed
            ? 'hover:border-[#ffffff]/20'
            : 'opacity-55'
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-xl border',
                agent.installed
                  ? 'bg-[#ffffff]/12 border-[#ffffff]/20 text-[#e5e5e5]'
                  : 'bg-white/[0.03] border-white/[0.05] text-white/30'
              )}
            >
              <Box className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{agent.name}</div>
              <div className="text-[11px] text-white/35">
                {agent.version ? `v${agent.version}` : 'Not detected'}
              </div>
            </div>
          </div>
          <Badge tone={agent.installed ? 'success' : 'muted'}>
            {agent.installed ? (
              <>
                <Check className="h-3 w-3" /> Installed
              </>
            ) : (
              <>
                <X className="h-3 w-3" /> Missing
              </>
            )}
          </Badge>
        </div>

        {agent.installed && (
          <div className="space-y-2 text-xs">
            {agent.storagePath && (
              <div className="flex items-start gap-2 text-white/40">
                <Folder className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="font-mono text-[11px] truncate">{agent.storagePath}</span>
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <div className="flex items-center gap-1 text-white/50">
                <Box className="h-3 w-3" />
                <span className="tabular-nums font-medium text-white/80">
                  {agent.projectCount}
                </span>
                projects
              </div>
              <div className="flex items-center gap-1 text-white/50">
                <MessageSquare className="h-3 w-3" />
                <span className="tabular-nums font-medium text-white/80">
                  {agent.conversationCount}
                </span>
                chats
              </div>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
