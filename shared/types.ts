/** Shared types between Electron main process and React renderer */

export type AgentId =
  | 'codex'
  | 'opencode'
  | 'claude-code'
  | 'continue'
  | 'aider'
  | 'gemini'

export type BackupStatus = 'idle' | 'running' | 'success' | 'error' | 'paused'
export type CloudProvider = 'google-drive' | 'local' | 'none'
export type AutoBackupInterval = 'manual' | '5m' | '15m' | '30m' | '1h'

export interface DetectedAgent {
  id: AgentId
  name: string
  installed: boolean
  version: string | null
  storagePath: string | null
  configPath: string | null
  projectCount: number
  conversationCount: number
  lastActivity: string | null
}

export interface Project {
  id: string
  name: string
  path: string
  framework: string | null
  agents: AgentId[]
  chatCount: number
  sizeBytes: number
  lastOpened: string | null
  lastBackup: string | null
  protected: boolean
  createdAt: string
  updatedAt: string
}

export interface BackupMeta {
  id: string
  projectId: string
  projectName: string
  /** Original absolute path on the machine that created the backup */
  projectPath: string | null
  agents: AgentId[]
  chatCount: number
  sizeBytes: number
  compressedBytes: number
  checksum: string
  encrypted: boolean
  location: 'local' | 'cloud' | 'both'
  cloudPath: string | null
  localPath: string | null
  computerName: string
  platform: string
  createdAt: string
  framework: string | null
  compressionRatio: number
  incremental: boolean
  parentBackupId: string | null
}

export interface RestorePoint {
  id: string
  backupId: string
  projectId: string
  projectName: string
  /** Auto restore destination (original project path) */
  projectPath: string | null
  label: string
  agents: AgentId[]
  chatCount: number
  sizeBytes: number
  framework: string | null
  createdAt: string
  computerName: string
}

export interface ActivityEvent {
  id: string
  type:
    | 'backup_started'
    | 'backup_complete'
    | 'backup_failed'
    | 'upload_complete'
    | 'conversation_changed'
    | 'restore_started'
    | 'restore_complete'
    | 'restore_failed'
    | 'agent_detected'
    | 'project_discovered'
    | 'drive_connected'
    | 'drive_disconnected'
    | 'integrity_check'
    | 'path_repaired'
    | 'error'
    | 'info'
  title: string
  message: string
  projectId?: string
  projectName?: string
  metadata?: Record<string, unknown>
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error'
}

export interface AppSettings {
  firstLaunchComplete: boolean
  offlineMode: boolean
  autoBackup: boolean
  autoBackupInterval: AutoBackupInterval
  theme: 'dark' | 'light' | 'system'
  notifications: boolean
  encryptionEnabled: boolean
  masterPasswordSet: boolean
  googleConnected: boolean
  googleEmail: string | null
  /** User-supplied Desktop OAuth Client ID (BYO Google Cloud project) */
  googleClientId: string | null
  /**
   * User-supplied Desktop OAuth Client Secret.
   * Stored only on this machine under AgentVault user data.
   */
  googleClientSecret: string | null
  cloudProvider: CloudProvider
  excludePatterns: string[]
  includeTerminalHistory: boolean
  includeGitMetadata: boolean
  defaultRestorePath: string | null
  computerName: string
  enabledAgents: AgentId[]
}

export interface DashboardStatus {
  protected: boolean
  lastBackup: string | null
  cloudStorage: CloudProvider
  encryptionEnabled: boolean
  autoBackup: boolean
  projectCount: number
  agentCount: number
  totalBackupSize: number
  totalConversations: number
}

export interface SearchResult {
  id: string
  type: 'project' | 'chat' | 'prompt' | 'file' | 'message'
  title: string
  subtitle: string
  projectId?: string
  projectName?: string
  path?: string
  snippet?: string
  timestamp?: string
  score: number
}

export interface BackupProgress {
  backupId: string
  projectId: string
  projectName: string
  stage:
    | 'gathering'
    | 'compressing'
    | 'encrypting'
    | 'uploading'
    | 'verifying'
    | 'complete'
    | 'error'
  progress: number
  message: string
  bytesProcessed?: number
  bytesTotal?: number
}

export interface RestoreProgress {
  restoreId: string
  backupId: string
  projectName: string
  stage:
    | 'downloading'
    | 'decrypting'
    | 'extracting'
    | 'restoring'
    | 'path_repair'
    | 'rebuilding'
    | 'complete'
    | 'error'
  progress: number
  message: string
}

export interface StorageAnalytics {
  totalLocalBytes: number
  totalCloudBytes: number
  backupCount: number
  projectCount: number
  averageCompressionRatio: number
  byProject: Array<{ projectId: string; name: string; bytes: number }>
  history: Array<{ date: string; bytes: number }>
}

export interface GoogleAuthState {
  connected: boolean
  email: string | null
  name: string | null
  picture: string | null
}

export interface PathRepairResult {
  filesScanned: number
  replacements: number
  paths: Array<{ file: string; count: number }>
}

export interface IntegrityResult {
  backupId: string
  valid: boolean
  checksumMatch: boolean
  encrypted: boolean
  errors: string[]
}

/** Catalog entry from Google Drive (fresh PC recovery) */
export interface CloudBackupEntry {
  backupId: string
  projectId: string
  projectName: string
  projectPath: string | null
  agents: AgentId[]
  chatCount: number
  sizeBytes: number
  compressedBytes: number
  framework: string | null
  createdAt: string
  computerName: string
  driveFileId: string
  metadataFileId: string | null
  /** true when only in cloud catalog, not yet on this machine */
  source: 'cloud' | 'local' | 'both'
  /**
   * plain-zip = current format (no encryption).
   * Older encrypted AES archives are purged and never listed.
   */
  format?: 'plain-zip' | 'legacy-encrypted'
  encrypted?: boolean
}

export interface RestoreOptions {
  /** Where project source files go (user-selected folder). History always goes to IDE paths. */
  projectTargetPath?: string | null
  /** Prefer Downloads/AgentVault-Restores/<name> when no path given */
  useDownloadsDefault?: boolean
}

/** IPC channel map */
export interface IpcApi {
  // App lifecycle
  getSettings: () => Promise<AppSettings>
  updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  completeFirstLaunch: (mode: 'google' | 'offline') => Promise<void>
  getDashboard: () => Promise<DashboardStatus>
  getComputerName: () => Promise<string>

  // Agents
  scanAgents: () => Promise<DetectedAgent[]>
  getAgents: () => Promise<DetectedAgent[]>

  // Projects
  getProjects: () => Promise<Project[]>
  getProject: (id: string) => Promise<Project | null>
  scanProjects: () => Promise<Project[]>
  openFolder: (path: string) => Promise<void>
  updateProject: (id: string, partial: Partial<Project>) => Promise<Project>

  // Backup — optional selectedAgents for multi-IDE projects
  startBackup: (
    projectId: string,
    selectedAgents?: AgentId[],
    options?: { complete?: boolean; forceCloud?: boolean }
  ) => Promise<string>
  /** Full project files + all linked IDE histories → Drive */
  completeBackup: (projectId: string) => Promise<string>
  cancelBackup: (backupId: string) => Promise<void>
  getBackups: (projectId?: string) => Promise<BackupMeta[]>
  getRestorePoints: (projectId?: string) => Promise<RestorePoint[]>
  verifyBackup: (backupId: string) => Promise<IntegrityResult>
  exportBackup: (backupId: string, destPath: string) => Promise<void>
  importBackup: (filePath: string) => Promise<BackupMeta>
  getBackupProgress: () => Promise<BackupProgress | null>

  // Restore — project files to chosen folder; IDE history auto to Codex/Claude/etc.
  startRestore: (
    backupId: string,
    targetPath?: string | null,
    options?: RestoreOptions
  ) => Promise<string>
  getRestoreProgress: () => Promise<RestoreProgress | null>
  previewBackup: (backupId: string) => Promise<RestorePoint>
  getDefaultRestorePath: (projectName: string) => Promise<string>

  // Search
  search: (query: string) => Promise<SearchResult[]>

  // Activity
  getActivity: (limit?: number) => Promise<ActivityEvent[]>
  clearActivity: () => Promise<void>

  // Google Drive
  connectGoogle: () => Promise<GoogleAuthState>
  disconnectGoogle: () => Promise<void>
  getGoogleAuth: () => Promise<GoogleAuthState>
  /** Save user Desktop OAuth Client ID + Secret (BYO Google Cloud) */
  saveGoogleOAuthCredentials: (
    clientId: string,
    clientSecret: string
  ) => Promise<{ ok: boolean }>
  clearGoogleOAuthCredentials: () => Promise<void>
  /** Scan AgentVault folder on Drive for plain-zip project backups only */
  scanDrive: () => Promise<CloudBackupEntry[]>
  getCloudBackups: () => Promise<CloudBackupEntry[]>
  /** Download cloud backup into local catalog then ready for restore */
  importFromDrive: (backupId: string) => Promise<BackupMeta>
  /**
   * Delete old AES-encrypted cloud backups + vault-escrow keys from Drive.
   * Keeps only plain ZIP archives.
   */
  purgeLegacyCloudBackups: () => Promise<{ deleted: number; kept: number }>

  // Legacy no-ops (no encryption keys in personal tool mode)
  setMasterPassword: (password: string) => Promise<{ recoveryKey: string }>
  unlockWithPassword: (password: string) => Promise<boolean>
  unlockWithRecoveryKey: (key: string) => Promise<boolean>
  isUnlocked: () => Promise<boolean>

  // Analytics
  getStorageAnalytics: () => Promise<StorageAnalytics>

  // Dialogs
  selectFolder: () => Promise<string | null>
  selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>

  // Events (subscribe)
  onBackupProgress: (cb: (p: BackupProgress) => void) => () => void
  onRestoreProgress: (cb: (p: RestoreProgress) => void) => () => void
  onActivity: (cb: (e: ActivityEvent) => void) => () => void
  onToast: (cb: (t: { type: string; title: string; message: string }) => void) => () => void
}

declare global {
  interface Window {
    agentVault: IpcApi
  }
}

export {}
