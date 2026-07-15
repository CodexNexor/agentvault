import { create } from 'zustand'
import type { BackupProgress, RestoreProgress } from '../../shared/types'

interface AppState {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  backupProgress: BackupProgress | null
  setBackupProgress: (p: BackupProgress | null) => void
  restoreProgress: RestoreProgress | null
  setRestoreProgress: (p: RestoreProgress | null) => void
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  backupProgress: null,
  setBackupProgress: (p) => set({ backupProgress: p }),
  restoreProgress: null,
  setRestoreProgress: (p) => set({ restoreProgress: p }),
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
}))
