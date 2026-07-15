import { useEffect } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { WelcomePage } from '@/pages/Welcome'
import { DashboardPage } from '@/pages/Dashboard'
import { ProjectsPage } from '@/pages/Projects'
import { ProjectDetailPage } from '@/pages/ProjectDetail'
import { BackupsPage } from '@/pages/Backups'
import { RestorePage } from '@/pages/Restore'
import { DrivePage } from '@/pages/Drive'
import { CloudProjectsPage } from '@/pages/CloudProjects'
import { SearchPage } from '@/pages/Search'
import { ActivityPage } from '@/pages/Activity'
import { SettingsPage } from '@/pages/Settings'
import { AboutPage } from '@/pages/About'
import { vault } from '@/lib/api'
import { useToastStore } from '@/stores/toast-store'
import { useAppStore } from '@/stores/app-store'
import { Skeleton } from '@/components/ui/Skeleton'

// HashRouter for Electron file:// protocol; BrowserRouter for Vite dev
const Router =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? HashRouter
    : BrowserRouter

function BootRouter() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => vault.getSettings(),
  })

  const push = useToastStore((s) => s.push)
  const setBackupProgress = useAppStore((s) => s.setBackupProgress)
  const setRestoreProgress = useAppStore((s) => s.setRestoreProgress)

  useEffect(() => {
    const unsubToast = vault.onToast((t) => {
      push({
        type: (t.type as 'success' | 'error' | 'info' | 'warning') || 'info',
        title: t.title,
        message: t.message,
      })
    })
    const unsubBackup = vault.onBackupProgress((p) => {
      setBackupProgress(p)
      if (p.stage === 'complete' || p.stage === 'error') {
        setTimeout(() => setBackupProgress(null), 2500)
      }
    })
    const unsubRestore = vault.onRestoreProgress((p) => {
      setRestoreProgress(p)
      if (p.stage === 'complete' || p.stage === 'error') {
        setTimeout(() => setRestoreProgress(null), 2500)
      }
    })

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Navigate handled by search page focus
        window.location.hash = '#/search'
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      unsubToast()
      unsubBackup()
      unsubRestore()
      window.removeEventListener('keydown', onKey)
    }
  }, [push, setBackupProgress, setRestoreProgress])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center ambient-bg">
        <div className="w-64 space-y-3">
          <Skeleton className="h-12 w-12 rounded-2xl mx-auto" />
          <Skeleton className="h-4 w-40 mx-auto" />
          <Skeleton className="h-3 w-28 mx-auto" />
        </div>
      </div>
    )
  }

  if (!settings?.firstLaunchComplete) {
    return (
      <Routes>
        <Route path="*" element={<WelcomePage />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="cloud-projects" element={<CloudProjectsPage />} />
        <Route path="drive" element={<DrivePage />} />
        <Route path="restore" element={<RestorePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <Router>
      <BootRouter />
    </Router>
  )
}
