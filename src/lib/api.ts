import type {
  ActivityEvent,
  AppSettings,
  BackupMeta,
  BackupProgress,
  CloudBackupEntry,
  DashboardStatus,
  DetectedAgent,
  GoogleAuthState,
  IntegrityResult,
  Project,
  RestoreOptions,
  RestorePoint,
  RestoreProgress,
  SearchResult,
  StorageAnalytics,
} from '../../shared/types'

/** Demo data when running outside Electron (browser preview) */
const DEMO_AGENTS: DetectedAgent[] = [
  {
    id: 'codex',
    name: 'Codex CLI',
    installed: true,
    version: '0.12.0',
    storagePath: '~/.codex',
    configPath: '~/.codex/config.toml',
    projectCount: 4,
    conversationCount: 128,
    lastActivity: new Date().toISOString(),
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    installed: true,
    version: '1.2.1',
    storagePath: '~/.opencode',
    configPath: '~/.opencode/config.json',
    projectCount: 2,
    conversationCount: 47,
    lastActivity: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    installed: true,
    version: '1.0.48',
    storagePath: '~/.claude',
    configPath: '~/.claude/settings.json',
    projectCount: 6,
    conversationCount: 214,
    lastActivity: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'continue',
    name: 'Continue',
    installed: true,
    version: '0.9.2',
    storagePath: '~/.continue',
    configPath: '~/.continue/config.json',
    projectCount: 3,
    conversationCount: 89,
    lastActivity: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'aider',
    name: 'Aider',
    installed: true,
    version: '0.72.0',
    storagePath: '~/.aider',
    configPath: '~/.aider.conf.yml',
    projectCount: 5,
    conversationCount: 56,
    lastActivity: new Date(Date.now() - 172800000).toISOString(),
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    installed: false,
    version: null,
    storagePath: null,
    configPath: null,
    projectCount: 0,
    conversationCount: 0,
    lastActivity: null,
  },
]

const DEMO_PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'AgentVault',
    path: '/home/dev/Projects/AgentVault',
    framework: 'Electron',
    agents: ['claude-code', 'codex'],
    chatCount: 42,
    sizeBytes: 48_200_000,
    lastOpened: new Date().toISOString(),
    lastBackup: new Date(Date.now() - 3600000).toISOString(),
    protected: true,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p2',
    name: 'nova-dashboard',
    path: '/home/dev/Projects/nova-dashboard',
    framework: 'Next.js',
    agents: ['claude-code', 'continue'],
    chatCount: 87,
    sizeBytes: 126_400_000,
    lastOpened: new Date(Date.now() - 86400000).toISOString(),
    lastBackup: new Date(Date.now() - 86400000).toISOString(),
    protected: true,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'p3',
    name: 'fleet-api',
    path: '/home/dev/Projects/fleet-api',
    framework: 'Rust',
    agents: ['codex', 'aider'],
    chatCount: 23,
    sizeBytes: 18_900_000,
    lastOpened: new Date(Date.now() - 2 * 86400000).toISOString(),
    lastBackup: null,
    protected: true,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'p4',
    name: 'linear-clone',
    path: '/home/dev/Projects/linear-clone',
    framework: 'React',
    agents: ['opencode', 'claude-code'],
    chatCount: 61,
    sizeBytes: 92_100_000,
    lastOpened: new Date(Date.now() - 3 * 86400000).toISOString(),
    lastBackup: new Date(Date.now() - 3 * 86400000).toISOString(),
    protected: true,
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
]

let demoSettings: AppSettings = {
  firstLaunchComplete: false,
  offlineMode: false,
  autoBackup: true,
  autoBackupInterval: '15m',
  theme: 'dark',
  notifications: true,
  encryptionEnabled: true,
  masterPasswordSet: false,
  googleConnected: false,
  googleEmail: null,
  googleClientId: null,
  googleClientSecret: null,
  cloudProvider: 'none',
  excludePatterns: ['node_modules', 'dist', 'build', '.cache', 'tmp', 'logs'],
  includeTerminalHistory: false,
  includeGitMetadata: true,
  defaultRestorePath: null,
  computerName: 'dev-machine',
  enabledAgents: ['codex', 'opencode', 'claude-code', 'continue', 'aider', 'gemini'],
}

let demoActivity: ActivityEvent[] = [
  {
    id: 'a1',
    type: 'backup_complete',
    title: 'Backup complete',
    message: 'AgentVault · 12.4 MB · encrypted',
    projectId: 'p1',
    projectName: 'AgentVault',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    level: 'success',
  },
  {
    id: 'a2',
    type: 'conversation_changed',
    title: 'Conversation updated',
    message: 'Claude Code session in nova-dashboard',
    projectId: 'p2',
    projectName: 'nova-dashboard',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    level: 'info',
  },
  {
    id: 'a3',
    type: 'agent_detected',
    title: 'Tools detected',
    message: 'Found 5 AI coding agents on this machine',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    level: 'info',
  },
]

let demoBackups: BackupMeta[] = [
  {
    id: 'b1',
    projectId: 'p1',
    projectName: 'AgentVault',
    projectPath: '/home/dev/Projects/AgentVault',
    agents: ['claude-code', 'codex'],
    chatCount: 42,
    sizeBytes: 48_200_000,
    compressedBytes: 12_400_000,
    checksum: 'abc123',
    encrypted: true,
    location: 'local',
    cloudPath: null,
    localPath: '/tmp/b1.avault',
    computerName: 'dev-machine',
    platform: 'linux',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    framework: 'Electron',
    compressionRatio: 0.257,
    incremental: false,
    parentBackupId: null,
  },
  {
    id: 'b2',
    projectId: 'p2',
    projectName: 'nova-dashboard',
    projectPath: '/home/dev/Projects/nova-dashboard',
    agents: ['claude-code', 'continue'],
    chatCount: 87,
    sizeBytes: 126_400_000,
    compressedBytes: 31_200_000,
    checksum: 'def456',
    encrypted: true,
    location: 'both',
    cloudPath: 'demo://b2',
    localPath: '/tmp/b2.avault',
    computerName: 'dev-machine',
    platform: 'linux',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    framework: 'Next.js',
    compressionRatio: 0.247,
    incremental: false,
    parentBackupId: null,
  },
  {
    id: 'b3',
    projectId: 'p1',
    projectName: 'AgentVault',
    projectPath: '/home/dev/Projects/AgentVault',
    agents: ['claude-code'],
    chatCount: 38,
    sizeBytes: 44_000_000,
    compressedBytes: 11_100_000,
    checksum: 'ghi789',
    encrypted: true,
    location: 'local',
    cloudPath: null,
    localPath: '/tmp/b3.avault',
    computerName: 'laptop-pro',
    platform: 'macos',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    framework: 'Electron',
    compressionRatio: 0.252,
    incremental: false,
    parentBackupId: null,
  },
]

function hasElectron(): boolean {
  return typeof window !== 'undefined' && Boolean(window.agentVault)
}

function api() {
  return window.agentVault
}

async function delay(ms = 200) {
  await new Promise((r) => setTimeout(r, ms))
}

export const vault = {
  async getSettings(): Promise<AppSettings> {
    if (hasElectron()) return api().getSettings()
    await delay()
    return { ...demoSettings }
  },

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    if (hasElectron()) return api().updateSettings(partial)
    demoSettings = { ...demoSettings, ...partial }
    return { ...demoSettings }
  },

  async completeFirstLaunch(mode: 'google' | 'offline'): Promise<void> {
    if (hasElectron()) return api().completeFirstLaunch(mode)
    demoSettings = {
      ...demoSettings,
      firstLaunchComplete: true,
      offlineMode: mode === 'offline',
      googleConnected: mode === 'google',
      googleEmail: mode === 'google' ? 'you@gmail.com' : null,
      cloudProvider: mode === 'google' ? 'google-drive' : 'local',
    }
  },

  async getDashboard(): Promise<DashboardStatus> {
    if (hasElectron()) return api().getDashboard()
    await delay()
    return {
      protected: true,
      lastBackup: demoBackups[0]?.createdAt ?? null,
      cloudStorage: demoSettings.cloudProvider,
      encryptionEnabled: demoSettings.encryptionEnabled,
      autoBackup: demoSettings.autoBackup,
      projectCount: DEMO_PROJECTS.length,
      agentCount: DEMO_AGENTS.filter((a) => a.installed).length,
      totalBackupSize: demoBackups.reduce((s, b) => s + b.compressedBytes, 0),
      totalConversations: DEMO_PROJECTS.reduce((s, p) => s + p.chatCount, 0),
    }
  },

  async getAgents(): Promise<DetectedAgent[]> {
    if (hasElectron()) return api().getAgents()
    await delay(300)
    return DEMO_AGENTS
  },

  async scanAgents(): Promise<DetectedAgent[]> {
    if (hasElectron()) return api().scanAgents()
    await delay(800)
    return DEMO_AGENTS
  },

  async getProjects(): Promise<Project[]> {
    if (hasElectron()) return api().getProjects()
    await delay(250)
    return DEMO_PROJECTS
  },

  async getProject(id: string): Promise<Project | null> {
    if (hasElectron()) return api().getProject(id)
    return DEMO_PROJECTS.find((p) => p.id === id) ?? null
  },

  async scanProjects(): Promise<Project[]> {
    if (hasElectron()) return api().scanProjects()
    await delay(1000)
    return DEMO_PROJECTS
  },

  async openFolder(folderPath: string): Promise<void> {
    if (hasElectron()) return api().openFolder(folderPath)
    console.log('Open folder:', folderPath)
  },

  async startBackup(
    projectId: string,
    selectedAgents?: import('../../shared/types').AgentId[],
    options?: { complete?: boolean; forceCloud?: boolean }
  ): Promise<string> {
    if (hasElectron()) return api().startBackup(projectId, selectedAgents, options)
    const id = `demo-b-${Date.now()}`
    return id
  },

  async completeBackup(projectId: string): Promise<string> {
    if (hasElectron()) return api().completeBackup(projectId)
    return this.startBackup(projectId, undefined, { complete: true, forceCloud: true })
  },

  async getBackups(projectId?: string): Promise<BackupMeta[]> {
    if (hasElectron()) return api().getBackups(projectId)
    await delay()
    return projectId
      ? demoBackups.filter((b) => b.projectId === projectId)
      : demoBackups
  },

  async getRestorePoints(projectId?: string): Promise<RestorePoint[]> {
    if (hasElectron()) return api().getRestorePoints(projectId)
    const backups = await this.getBackups(projectId)
    return backups.map((b) => ({
      id: b.id,
      backupId: b.id,
      projectId: b.projectId,
      projectName: b.projectName,
      projectPath: b.projectPath ?? null,
      label: 'Restore Point',
      agents: b.agents,
      chatCount: b.chatCount,
      sizeBytes: b.sizeBytes,
      framework: b.framework,
      createdAt: b.createdAt,
      computerName: b.computerName,
    }))
  },

  async startRestore(
    backupId: string,
    targetPath?: string | null,
    options?: RestoreOptions
  ): Promise<string> {
    if (hasElectron()) return api().startRestore(backupId, targetPath, options)
    console.log('Restore', backupId, targetPath, options)
    return `restore-${Date.now()}`
  },

  async getDefaultRestorePath(projectName: string): Promise<string> {
    if (hasElectron()) return api().getDefaultRestorePath(projectName)
    return `/home/dev/Downloads/AgentVault-Restores/${projectName}`
  },

  async scanDrive(): Promise<CloudBackupEntry[]> {
    if (hasElectron()) return api().scanDrive()
    await delay(400)
    const local = await this.getBackups()
    return local.map((b) => ({
      backupId: b.id,
      projectId: b.projectId,
      projectName: b.projectName,
      projectPath: b.projectPath,
      agents: b.agents,
      chatCount: b.chatCount,
      sizeBytes: b.sizeBytes,
      compressedBytes: b.compressedBytes,
      framework: b.framework,
      createdAt: b.createdAt,
      computerName: b.computerName,
      driveFileId: b.cloudPath || `demo-${b.id}`,
      metadataFileId: null,
      source: 'both' as const,
    }))
  },

  async getCloudBackups(): Promise<CloudBackupEntry[]> {
    return this.scanDrive()
  },

  async importFromDrive(backupId: string): Promise<BackupMeta> {
    if (hasElectron()) return api().importFromDrive(backupId)
    const b = demoBackups.find((x) => x.id === backupId)
    if (!b) throw new Error('Not found')
    return b
  },

  async search(query: string): Promise<SearchResult[]> {
    if (hasElectron()) return api().search(query)
    await delay(150)
    const q = query.toLowerCase()
    return DEMO_PROJECTS.filter(
      (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
    ).map((p, i) => ({
      id: p.id,
      type: 'project' as const,
      title: p.name,
      subtitle: p.path,
      projectId: p.id,
      projectName: p.name,
      path: p.path,
      score: 1 - i * 0.1,
    }))
  },

  async getActivity(limit = 100): Promise<ActivityEvent[]> {
    if (hasElectron()) return api().getActivity(limit)
    await delay()
    return demoActivity.slice(0, limit)
  },

  async clearActivity(): Promise<void> {
    if (hasElectron()) return api().clearActivity()
    demoActivity = []
  },

  async connectGoogle(): Promise<GoogleAuthState> {
    if (hasElectron()) return api().connectGoogle()
    if (!demoSettings.googleClientId || !demoSettings.googleClientSecret) {
      throw new Error('Save Client ID and Client secret first')
    }
    demoSettings = {
      ...demoSettings,
      googleConnected: true,
      googleEmail: 'you@gmail.com',
      cloudProvider: 'google-drive',
    }
    return {
      connected: true,
      email: 'you@gmail.com',
      name: 'You',
      picture: null,
    }
  },

  async disconnectGoogle(): Promise<void> {
    if (hasElectron()) return api().disconnectGoogle()
    demoSettings = {
      ...demoSettings,
      googleConnected: false,
      googleEmail: null,
      cloudProvider: 'local',
    }
  },

  async getGoogleAuth(): Promise<GoogleAuthState> {
    if (hasElectron()) return api().getGoogleAuth()
    return {
      connected: demoSettings.googleConnected,
      email: demoSettings.googleEmail,
      name: null,
      picture: null,
    }
  },

  async saveGoogleOAuthCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<{ ok: boolean }> {
    if (hasElectron()) return api().saveGoogleOAuthCredentials(clientId, clientSecret)
    demoSettings = {
      ...demoSettings,
      googleClientId: clientId.trim(),
      googleClientSecret: clientSecret.trim(),
    }
    return { ok: true }
  },

  async clearGoogleOAuthCredentials(): Promise<void> {
    if (hasElectron()) return api().clearGoogleOAuthCredentials()
    demoSettings = {
      ...demoSettings,
      googleClientId: null,
      googleClientSecret: null,
      googleConnected: false,
      googleEmail: null,
      cloudProvider: 'none',
    }
  },

  async setMasterPassword(password: string): Promise<{ recoveryKey: string }> {
    if (hasElectron()) return api().setMasterPassword(password)
    demoSettings.masterPasswordSet = true
    return { recoveryKey: 'AV-DEMO-RECOVERY-KEY-' + Math.random().toString(36).slice(2, 10).toUpperCase() }
  },

  async getStorageAnalytics(): Promise<StorageAnalytics> {
    if (hasElectron()) return api().getStorageAnalytics()
    return {
      totalLocalBytes: demoBackups.reduce((s, b) => s + b.compressedBytes, 0),
      totalCloudBytes: demoBackups
        .filter((b) => b.location !== 'local')
        .reduce((s, b) => s + b.compressedBytes, 0),
      backupCount: demoBackups.length,
      projectCount: DEMO_PROJECTS.length,
      averageCompressionRatio: 0.25,
      byProject: DEMO_PROJECTS.map((p) => ({
        projectId: p.id,
        name: p.name,
        bytes: demoBackups
          .filter((b) => b.projectId === p.id)
          .reduce((s, b) => s + b.compressedBytes, 0),
      })),
      history: Array.from({ length: 14 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - (13 - i))
        return {
          date: d.toISOString().slice(0, 10),
          bytes: i === 13 ? 12_400_000 : i === 12 ? 31_200_000 : Math.random() * 5_000_000,
        }
      }),
    }
  },

  async selectFolder(): Promise<string | null> {
    if (hasElectron()) return api().selectFolder()
    return '/home/dev/Projects/restored'
  },

  async selectFile(
    filters?: { name: string; extensions: string[] }[]
  ): Promise<string | null> {
    if (hasElectron()) return api().selectFile(filters)
    return null
  },

  async importBackup(filePath: string): Promise<BackupMeta> {
    if (hasElectron()) return api().importBackup(filePath)
    const b: BackupMeta = {
      id: `import-${Date.now()}`,
      projectId: 'imported',
      projectName: 'Imported Project',
      projectPath: '/home/dev/Projects/Imported Project',
      agents: [],
      chatCount: 0,
      sizeBytes: 10_000_000,
      compressedBytes: 3_000_000,
      checksum: 'import',
      encrypted: true,
      location: 'local',
      cloudPath: null,
      localPath: filePath,
      computerName: 'unknown',
      platform: 'linux',
      createdAt: new Date().toISOString(),
      framework: null,
      compressionRatio: 0.3,
      incremental: false,
      parentBackupId: null,
    }
    demoBackups.unshift(b)
    return b
  },

  async exportBackup(backupId: string, destPath: string): Promise<void> {
    if (hasElectron()) return api().exportBackup(backupId, destPath)
    console.log('Export', backupId, destPath)
  },

  async verifyBackup(backupId: string): Promise<IntegrityResult> {
    if (hasElectron()) return api().verifyBackup(backupId)
    return {
      backupId,
      valid: true,
      checksumMatch: true,
      encrypted: true,
      errors: [],
    }
  },

  onBackupProgress(cb: (p: BackupProgress) => void): () => void {
    if (hasElectron()) return api().onBackupProgress(cb)
    return () => {}
  },

  onRestoreProgress(cb: (p: RestoreProgress) => void): () => void {
    if (hasElectron()) return api().onRestoreProgress(cb)
    return () => {}
  },

  onToast(cb: (t: { type: string; title: string; message: string }) => void): () => void {
    if (hasElectron()) return api().onToast(cb)
    return () => {}
  },
}
