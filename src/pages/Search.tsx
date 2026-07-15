import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Search as SearchIcon,
  FolderKanban,
  MessageSquare,
  FileText,
  Sparkles,
} from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { vault } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { SearchResult } from '../../shared/types'

const typeIcon = {
  project: FolderKanban,
  chat: MessageSquare,
  prompt: Sparkles,
  file: FileText,
  message: MessageSquare,
}

export function SearchPage() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  const { data: results, isFetching } = useQuery({
    queryKey: ['search', query],
    queryFn: () => vault.search(query),
    enabled: query.trim().length > 0,
    placeholderData: (prev) => prev,
  })

  const grouped = useMemo(() => {
    const map: Record<string, SearchResult[]> = {}
    for (const r of results || []) {
      if (!map[r.type]) map[r.type] = []
      map[r.type].push(r)
    }
    return map
  }, [results])

  const typeOrder = ['project', 'chat', 'message', 'prompt', 'file'] as const
  const typeLabels: Record<string, string> = {
    project: 'Projects',
    chat: 'Chats',
    message: 'Messages',
    prompt: 'Prompts',
    file: 'Files',
  }

  return (
    <div>
      <TopBar title="Search" subtitle="Projects, chats, prompts, files & messages" />
      <div className="p-6 max-w-[800px]">
        <div className="relative mb-8">
          <SearchIcon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything…"
            className="h-12 pl-11 text-[15px] rounded-2xl"
          />
        </div>

        {!query.trim() ? (
          <EmptyState
            icon={SearchIcon}
            title="Global search"
            description="Find projects, conversation history, prompts, and files across all backed-up workspaces."
          />
        ) : isFetching && !results ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : !results?.length ? (
          <EmptyState
            icon={SearchIcon}
            title="No results"
            description={`Nothing matched “${query}”. Try another keyword.`}
          />
        ) : (
          <div className="space-y-6">
            {typeOrder
              .filter((t) => grouped[t]?.length)
              .map((type) => (
                <section key={type}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-white/30 mb-2">
                    {typeLabels[type]}
                  </h2>
                  <div className="space-y-1.5">
                    {grouped[type].map((r, i) => {
                      const Icon = typeIcon[r.type] || FileText
                      return (
                        <motion.div
                          key={r.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <Card
                            padding="sm"
                            hover
                            className={cn(
                              r.type === 'project' && r.projectId
                                ? 'cursor-pointer'
                                : ''
                            )}
                            onClick={() => {
                              if (r.projectId) navigate(`/projects/${r.projectId}`)
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.05]">
                                <Icon className="h-4 w-4 text-[#e5e5e5]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">
                                    {r.title}
                                  </span>
                                  <Badge tone="muted">{r.type}</Badge>
                                </div>
                                <p className="text-xs text-white/40 truncate mt-0.5">
                                  {r.subtitle}
                                </p>
                                {r.snippet && (
                                  <p className="text-xs text-white/30 mt-1 line-clamp-2">
                                    {r.snippet}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
