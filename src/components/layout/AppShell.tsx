import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { ToastViewport } from '@/components/ui/Toast'
import { ProgressOverlay } from '@/components/ProgressOverlay'

export function AppShell() {
  return (
    <div className="flex h-full ambient-bg noise relative">
      <Sidebar />
      <main className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <ToastViewport />
      <ProgressOverlay />
    </div>
  )
}
