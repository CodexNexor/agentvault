import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '../shared/types'

const api: IpcApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  completeFirstLaunch: (mode) => ipcRenderer.invoke('app:completeFirstLaunch', mode),
  getDashboard: () => ipcRenderer.invoke('app:getDashboard'),
  getComputerName: () => ipcRenderer.invoke('app:getComputerName'),

  scanAgents: () => ipcRenderer.invoke('agents:scan'),
  getAgents: () => ipcRenderer.invoke('agents:get'),

  getProjects: () => ipcRenderer.invoke('projects:get'),
  getProject: (id) => ipcRenderer.invoke('projects:getOne', id),
  scanProjects: () => ipcRenderer.invoke('projects:scan'),
  openFolder: (path) => ipcRenderer.invoke('projects:openFolder', path),
  updateProject: (id, partial) => ipcRenderer.invoke('projects:update', id, partial),

  startBackup: (projectId, selectedAgents, options) =>
    ipcRenderer.invoke('backup:start', projectId, selectedAgents, options),
  completeBackup: (projectId) => ipcRenderer.invoke('backup:complete', projectId),
  cancelBackup: (backupId) => ipcRenderer.invoke('backup:cancel', backupId),
  getBackups: (projectId) => ipcRenderer.invoke('backup:list', projectId),
  getRestorePoints: (projectId) => ipcRenderer.invoke('backup:restorePoints', projectId),
  verifyBackup: (backupId) => ipcRenderer.invoke('backup:verify', backupId),
  exportBackup: (backupId, destPath) =>
    ipcRenderer.invoke('backup:export', backupId, destPath),
  importBackup: (filePath) => ipcRenderer.invoke('backup:import', filePath),
  getBackupProgress: () => ipcRenderer.invoke('backup:progress'),

  startRestore: (backupId, targetPath, options) =>
    ipcRenderer.invoke('restore:start', backupId, targetPath, options),
  getRestoreProgress: () => ipcRenderer.invoke('restore:progress'),
  previewBackup: (backupId) => ipcRenderer.invoke('restore:preview', backupId),
  getDefaultRestorePath: (projectName) =>
    ipcRenderer.invoke('restore:defaultPath', projectName),

  search: (query) => ipcRenderer.invoke('search:query', query),

  getActivity: (limit) => ipcRenderer.invoke('activity:list', limit),
  clearActivity: () => ipcRenderer.invoke('activity:clear'),

  connectGoogle: () => ipcRenderer.invoke('google:connect'),
  disconnectGoogle: () => ipcRenderer.invoke('google:disconnect'),
  getGoogleAuth: () => ipcRenderer.invoke('google:auth'),
  saveGoogleOAuthCredentials: (clientId, clientSecret) =>
    ipcRenderer.invoke('google:saveOAuth', clientId, clientSecret),
  clearGoogleOAuthCredentials: () => ipcRenderer.invoke('google:clearOAuth'),
  scanDrive: () => ipcRenderer.invoke('drive:scan'),
  getCloudBackups: () => ipcRenderer.invoke('drive:scan'),
  importFromDrive: (backupId) => ipcRenderer.invoke('drive:import', backupId),

  setMasterPassword: (password) =>
    ipcRenderer.invoke('security:setMasterPassword', password),
  unlockWithPassword: (password) => ipcRenderer.invoke('security:unlock', password),
  unlockWithRecoveryKey: (key) =>
    ipcRenderer.invoke('security:unlockRecovery', key),
  isUnlocked: () => ipcRenderer.invoke('security:isUnlocked'),

  getStorageAnalytics: () => ipcRenderer.invoke('analytics:storage'),

  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),

  onBackupProgress: (cb) => {
    const handler = (_: unknown, p: Parameters<typeof cb>[0]) => cb(p)
    ipcRenderer.on('backup:progress', handler)
    return () => ipcRenderer.removeListener('backup:progress', handler)
  },
  onRestoreProgress: (cb) => {
    const handler = (_: unknown, p: Parameters<typeof cb>[0]) => cb(p)
    ipcRenderer.on('restore:progress', handler)
    return () => ipcRenderer.removeListener('restore:progress', handler)
  },
  onActivity: (cb) => {
    const handler = (_: unknown, e: Parameters<typeof cb>[0]) => cb(e)
    ipcRenderer.on('activity:event', handler)
    return () => ipcRenderer.removeListener('activity:event', handler)
  },
  onToast: (cb) => {
    const handler = (_: unknown, t: Parameters<typeof cb>[0]) => cb(t)
    ipcRenderer.on('toast', handler)
    return () => ipcRenderer.removeListener('toast', handler)
  },
}

contextBridge.exposeInMainWorld('agentVault', api)
