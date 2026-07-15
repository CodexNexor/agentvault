import { useQuery } from '@tanstack/react-query'
import { FolderSearch, RefreshCw } from 'lucide-react'
import { TopBar } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { vault } from '@/lib/api'
import { useToastStore } from '@/stores/toast-store'

export function ProjectsPage() {
  const push = useToastStore((s) => s.push)
  const { data: projects, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['projects'],
    queryFn: () => vault.getProjects(),
  })

  const scan = async () => {
    await vault.scanProjects()
    await refetch()
    push({ type: 'info', title: 'Projects refreshed', message: 'Scan completed successfully.' })
  }

  return (
    <div>
      <TopBar title="Projects" subtitle="All detected AI coding workspaces" />
      <div className="p-6 max-w-[1400px]">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-white/40">
            {projects?.length ?? 0} project{(projects?.length ?? 0) === 1 ? '' : 's'} discovered
          </p>
          <Button size="sm" variant="secondary" loading={isFetching} onClick={scan}>
            <RefreshCw className="h-3.5 w-3.5" />
            Scan system
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : !projects?.length ? (
          <EmptyState
            icon={FolderSearch}
            title="No AI projects found yet"
            description="We only list folders that Claude Code, Codex, OpenCode, Aider, Continue, or Gemini actually used. Open a repo in one of those tools, then scan again."
            action={
              <Button onClick={scan} loading={isFetching}>
                Scan again
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
