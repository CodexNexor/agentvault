import { ipcMain, dialog, shell, type BrowserWindow } from 'electron'
import { database } from './services/database.js'
import { encryption } from './services/encryption.js'
import { agentRegistry } from './agents/registry.js'
import { projectScanner } from './services/scanner.js'
import { backupEngine } from './services/backup-engine.js'
import { restoreEngine } from './services/restore-engine.js'
import { googleDrive } from './services/google-drive.js'
import { autoBackupWatcher } from './services/watcher.js'
import { getStorageAnalytics } from './services/analytics.js'
import { getComputerName } from './services/paths.js'
import type { AppSettings, DashboardStatus } from '../shared/types.js'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // Settings
  ipcMain.handle('settings:get', () => database.getSettings())
  ipcMain.handle('settings:update', async (_e, partial: Partial<AppSettings>) => {
    const next = database.updateSettings(partial)
    if (
      partial.autoBackup !== undefined ||
      partial.autoBackupInterval !== undefined
    ) {
      await autoBackupWatcher.restart()
    }
    return next
  })

  ipcMain.handle('app:completeFirstLaunch', async (_e, mode: 'google' | 'offline') => {
    if (mode === 'google') {
      try {
        await googleDrive.connect()
      } catch (err) {
        console.error(err)
      }
      database.updateSettings({
        firstLaunchComplete: true,
        offlineMode: false,
        cloudProvider: 'google-drive',
      })
    } else {
      database.updateSettings({
        firstLaunchComplete: true,
        offlineMode: true,
        cloudProvider: 'local',
      })
    }
  })

  ipcMain.handle('app:getDashboard', (): DashboardStatus => {
    const settings = database.getSettings()
    const projects = database.getProjects()
    const agents = database.getAgents()
    const backups = database.getBackups()
    const lastBackup =
      backups.length > 0
        ? backups.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )[0].createdAt
        : null

    return {
      protected: projects.some((p) => p.protected) || backups.length > 0,
      lastBackup,
      cloudStorage: settings.cloudProvider,
      encryptionEnabled: settings.encryptionEnabled,
      autoBackup: settings.autoBackup,
      projectCount: projects.length,
      agentCount: agents.filter((a) => a.installed).length,
      totalBackupSize: backups.reduce((s, b) => s + b.compressedBytes, 0),
      totalConversations: projects.reduce((s, p) => s + p.chatCount, 0),
    }
  })

  ipcMain.handle('app:getComputerName', () => getComputerName())

  // Agents
  ipcMain.handle('agents:scan', () => agentRegistry.scanAll())
  ipcMain.handle('agents:get', () => {
    const agents = database.getAgents()
    if (agents.length === 0) return agentRegistry.scanAll()
    return agents
  })

  // Projects
  ipcMain.handle('projects:get', () => database.getProjects())
  ipcMain.handle('projects:getOne', (_e, id: string) => database.getProject(id))
  ipcMain.handle('projects:scan', () => projectScanner.scan())
  ipcMain.handle('projects:openFolder', async (_e, folderPath: string) => {
    await shell.openPath(folderPath)
  })
  ipcMain.handle('projects:update', (_e, id: string, partial: object) =>
    database.updateProject(id, partial)
  )

  // Backup
  ipcMain.handle(
    'backup:start',
    async (
      _e,
      projectId: string,
      selectedAgents?: string[],
      options?: { complete?: boolean; forceCloud?: boolean }
    ) => {
      return backupEngine.backupProject(
        projectId,
        selectedAgents as import('../shared/types.js').AgentId[] | undefined,
        options
      )
    }
  )
  ipcMain.handle('backup:complete', async (_e, projectId: string) => {
    return backupEngine.completeBackup(projectId)
  })
  ipcMain.handle('backup:cancel', (_e, backupId: string) => {
    backupEngine.cancel(backupId)
  })
  ipcMain.handle('backup:list', (_e, projectId?: string) => database.getBackups(projectId))
  ipcMain.handle('backup:restorePoints', (_e, projectId?: string) =>
    database.getRestorePoints(projectId)
  )
  ipcMain.handle('backup:verify', (_e, backupId: string) =>
    backupEngine.verifyBackup(backupId)
  )
  ipcMain.handle('backup:export', (_e, backupId: string, destPath: string) =>
    backupEngine.exportBackup(backupId, destPath)
  )
  ipcMain.handle('backup:import', (_e, filePath: string) =>
    backupEngine.importBackup(filePath)
  )
  ipcMain.handle('backup:progress', () => backupEngine.getProgress())

  // Restore — project folder optional; IDE history always to standard agent paths
  ipcMain.handle(
    'restore:start',
    (
      _e,
      backupId: string,
      targetPath?: string | null,
      options?: import('../shared/types.js').RestoreOptions
    ) => restoreEngine.restore(backupId, targetPath, options)
  )
  ipcMain.handle('restore:progress', () => restoreEngine.getProgress())
  ipcMain.handle('restore:preview', (_e, backupId: string) => {
    const points = database.getRestorePoints()
    const point = points.find((p) => p.backupId === backupId)
    if (!point) throw new Error('Backup not found')
    return point
  })
  ipcMain.handle('restore:defaultPath', (_e, projectName: string) =>
    restoreEngine.getDefaultRestorePath(projectName)
  )

  // Drive scan / import for fresh PC recovery (plain ZIP only)
  ipcMain.handle('drive:scan', async () => googleDrive.scanDrive())
  ipcMain.handle('drive:import', async (_e, backupId: string) => {
    const list = await googleDrive.scanDrive()
    const entry = list.find((c) => c.backupId === backupId)
    if (!entry) throw new Error('Backup not found on Drive (plain ZIP only)')
    await googleDrive.importCloudBackup(entry)
    return database.getBackup(backupId)
  })
  ipcMain.handle('drive:purgeLegacy', async () =>
    googleDrive.purgeLegacyCloudBackups()
  )

  // Search
  ipcMain.handle('search:query', (_e, query: string) => {
    if (!query.trim()) return []
    const indexed = database.search(query)
    // Also search projects live
    const projects = database.getProjects().filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.path.toLowerCase().includes(query.toLowerCase())
    )
    const projectResults = projects.map((p, i) => ({
      id: `live-project:${p.id}`,
      type: 'project' as const,
      title: p.name,
      subtitle: p.path,
      projectId: p.id as string | undefined,
      projectName: p.name as string | undefined,
      path: p.path as string | undefined,
      snippet: undefined as string | undefined,
      timestamp: p.lastOpened as string | undefined,
      score: 1 - i * 0.01,
    }))
    const seen = new Set(indexed.map((r) => r.title + r.type))
    for (const r of projectResults) {
      if (!seen.has(r.title + r.type)) indexed.unshift(r)
    }
    return indexed.slice(0, 50)
  })

  // Activity
  ipcMain.handle('activity:list', (_e, limit?: number) => database.getActivity(limit))
  ipcMain.handle('activity:clear', () => database.clearActivity())

  // Google
  ipcMain.handle('google:connect', async () => {
    const state = await googleDrive.connect()
    getWindow()?.webContents.send('toast', {
      type: 'success',
      title: 'Google Drive Connected',
      message: state.email ? `Signed in as ${state.email}` : 'Cloud backup ready',
    })
    return state
  })
  ipcMain.handle('google:disconnect', () => googleDrive.disconnect())
  ipcMain.handle('google:auth', () => googleDrive.getAuthState())
  ipcMain.handle(
    'google:saveOAuth',
    async (_e, clientId: string, clientSecret: string) => {
      await googleDrive.saveUserCredentials(clientId, clientSecret)
      return { ok: true }
    }
  )
  ipcMain.handle('google:clearOAuth', async () => {
    await googleDrive.clearUserCredentials()
  })

  // Kept for older UI compatibility — no encryption keys in this app
  ipcMain.handle('security:setMasterPassword', async () => ({
    recoveryKey: '',
  }))
  ipcMain.handle('security:unlock', async () => true)
  ipcMain.handle('security:unlockRecovery', async () => true)
  ipcMain.handle('security:isUnlocked', () => encryption.isUnlocked())

  // Analytics
  ipcMain.handle('analytics:storage', () => getStorageAnalytics())

  // Dialogs
  ipcMain.handle('dialog:selectFolder', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })

  ipcMain.handle(
    'dialog:selectFile',
    async (
      _e,
      filters?: { name: string; extensions: string[] }[]
    ) => {
      const win = getWindow()
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: filters || [
          { name: 'AgentVault Backup', extensions: ['avault', 'zip'] },
        ],
      })
      return result.canceled ? null : result.filePaths[0] ?? null
    }
  )
}
