import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  FolderKanban,
  HardDrive,
  RotateCcw,
  Search,
  Activity,
  Settings,
  Info,
  Shield,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudDownload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/stores/app-store'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/backups', label: 'Backups', icon: HardDrive },
  { to: '/cloud-projects', label: 'Cloud Projects', icon: CloudDownload },
  { to: '/drive', label: 'Google Drive', icon: Cloud },
  { to: '/restore', label: 'Restore', icon: RotateCcw },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/about', label: 'About', icon: Info },
]

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed)

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-white/[0.05] bg-[#0c0c0c]/90 backdrop-blur-xl transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[240px]'
      )}
    >
      <div className="drag-region flex h-14 items-center gap-2.5 px-4 border-b border-white/[0.04]">
        <div className="no-drag flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
          <Shield className="h-4 w-4 text-black" />
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="no-drag min-w-0"
          >
            <div className="text-sm font-semibold tracking-tight">AgentVault</div>
            <div className="text-[10px] text-white/35 tracking-wide">FOR DEVELOPERS</div>
          </motion.div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2.5 overflow-y-auto">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-[#ffffff]/12 text-white'
                  : 'text-white/50 hover:bg-white/[0.04] hover:text-white/90'
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#ffffff]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors',
                    isActive ? 'text-[#ffffff]' : 'text-white/40 group-hover:text-white/70'
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-2.5 border-t border-white/[0.04]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-white/40 hover:bg-white/[0.04] hover:text-white/70 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
