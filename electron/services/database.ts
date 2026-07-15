import fs from 'fs-extra'
import path from 'node:path'
import { getAppPaths, getComputerName } from './paths.js'
import type {
  ActivityEvent,
  AgentId,
  AppSettings,
  BackupMeta,
  DetectedAgent,
  Project,
  RestorePoint,
} from '../../shared/types.js'
import { v4 as uuid } from 'uuid'

const DEFAULT_SETTINGS: AppSettings = {
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
  excludePatterns: [
    'node_modules',
    'dist',
    'build',
    '.cache',
    'tmp',
    'logs',
    '.git/objects',
    '*.log',
    '.next',
    'coverage',
    '__pycache__',
    '.venv',
    'venv',
    'target',
  ],
  includeTerminalHistory: false,
  includeGitMetadata: true,
  defaultRestorePath: null,
  computerName: getComputerName(),
  enabledAgents: [
    'codex',
    'opencode',
    'claude-code',
    'continue',
    'aider',
    'gemini',
  ],
}

interface StoreShape {
  settings: AppSettings
  agents: DetectedAgent[]
  projects: Project[]
  backups: BackupMeta[]
  activity: ActivityEvent[]
  searchIndex: Array<{
    id: string
    type: string
    title: string
    subtitle?: string
    projectId?: string
    projectName?: string
    path?: string
    snippet?: string
    timestamp?: string
    content?: string
  }>
}

/**
 * Lightweight durable store (JSON on disk).
 * Avoids native SQLite rebuild issues across Electron ABIs while remaining
 * production-ready for AgentVault metadata volumes.
 */
export class DatabaseService {
  private store: StoreShape = {
    settings: { ...DEFAULT_SETTINGS },
    agents: [],
    projects: [],
    backups: [],
    activity: [],
    searchIndex: [],
  }
  private filePath = ''
  private writeTimer: ReturnType<typeof setTimeout> | null = null

  initialize(): void {
    const { db } = getAppPaths()
    this.filePath = db.endsWith('.db')
      ? db.replace(/\.db$/, '.json')
      : path.join(path.dirname(db), 'agentvault.json')
    fs.ensureDirSync(path.dirname(this.filePath))
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readJsonSync(this.filePath) as Partial<StoreShape>
        this.store = {
          settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
          agents: raw.agents || [],
          projects: raw.projects || [],
          backups: raw.backups || [],
          activity: raw.activity || [],
          searchIndex: raw.searchIndex || [],
        }
      } catch {
        this.persist(true)
      }
    } else {
      this.persist(true)
    }
  }

  private persist(immediate = false): void {
    const write = () => {
      try {
        fs.writeJsonSync(this.filePath, this.store, { spaces: 2 })
      } catch (err) {
        console.error('[Database] persist failed', err)
      }
    }
    if (immediate) {
      write()
      return
    }
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(write, 50)
  }

  // ─── Settings ───────────────────────────────────────────

  getSettings(): AppSettings {
    return { ...this.store.settings }
  }

  saveSettings(settings: AppSettings): void {
    this.store.settings = { ...settings }
    this.persist()
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    const next = { ...this.store.settings, ...partial }
    this.store.settings = next
    this.persist()
    return { ...next }
  }

  // ─── Agents ─────────────────────────────────────────────

  upsertAgent(agent: DetectedAgent): void {
    const idx = this.store.agents.findIndex((a) => a.id === agent.id)
    if (idx >= 0) this.store.agents[idx] = agent
    else this.store.agents.push(agent)
    this.persist()
  }

  getAgents(): DetectedAgent[] {
    return [...this.store.agents].sort((a, b) => a.name.localeCompare(b.name))
  }

  // ─── Projects ───────────────────────────────────────────

  upsertProject(project: Project): void {
    const byPath = this.store.projects.findIndex((p) => p.path === project.path)
    if (byPath >= 0) {
      this.store.projects[byPath] = {
        ...this.store.projects[byPath],
        ...project,
        id: this.store.projects[byPath].id,
      }
    } else {
      const byId = this.store.projects.findIndex((p) => p.id === project.id)
      if (byId >= 0) this.store.projects[byId] = project
      else this.store.projects.push(project)
    }
    this.persist()
  }

  getProjects(): Project[] {
    // Only surface projects linked to at least one AI IDE
    return [...this.store.projects]
      .filter((p) => Array.isArray(p.agents) && p.agents.length > 0)
      .sort((a, b) => {
        const ao = a.lastOpened ? new Date(a.lastOpened).getTime() : 0
        const bo = b.lastOpened ? new Date(b.lastOpened).getTime() : 0
        if (bo !== ao) return bo - ao
        return a.name.localeCompare(b.name)
      })
  }

  getProject(id: string): Project | null {
    return this.store.projects.find((p) => p.id === id) ?? null
  }

  getProjectByPath(p: string): Project | null {
    return this.store.projects.find((x) => x.path === p) ?? null
  }

  updateProject(id: string, partial: Partial<Project>): Project | null {
    const current = this.getProject(id)
    if (!current) return null
    const next = { ...current, ...partial, updatedAt: new Date().toISOString() }
    this.upsertProject(next)
    return next
  }

  // ─── Backups ────────────────────────────────────────────

  insertBackup(backup: BackupMeta): void {
    this.store.backups.unshift(backup)
    this.persist()
  }

  getBackups(projectId?: string): BackupMeta[] {
    const list = projectId
      ? this.store.backups.filter((b) => b.projectId === projectId)
      : [...this.store.backups]
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  getBackup(id: string): BackupMeta | null {
    return this.store.backups.find((b) => b.id === id) ?? null
  }

  getRestorePoints(projectId?: string): RestorePoint[] {
    return this.getBackups(projectId).map((b) => {
      // Resolve original path: backup field → linked project record
      const linked = this.getProject(b.projectId)
      const projectPath =
        b.projectPath ||
        linked?.path ||
        null
      return {
        id: b.id,
        backupId: b.id,
        projectId: b.projectId,
        projectName: b.projectName,
        projectPath,
        label: this.relativeLabel(b.createdAt),
        agents: b.agents,
        chatCount: b.chatCount,
        sizeBytes: b.sizeBytes,
        framework: b.framework,
        createdAt: b.createdAt,
        computerName: b.computerName,
      }
    })
  }

  /** Patch older backups missing projectPath */
  ensureBackupProjectPaths(): void {
    let changed = false
    for (const b of this.store.backups) {
      if (!b.projectPath) {
        const p = this.store.projects.find((x) => x.id === b.projectId)
        if (p?.path) {
          b.projectPath = p.path
          changed = true
        }
      }
    }
    if (changed) this.persist()
  }

  private relativeLabel(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const weekAgo = new Date(startOfToday)
    weekAgo.setDate(weekAgo.getDate() - 7)

    if (d >= startOfToday) return 'Today'
    if (d >= startOfYesterday) return 'Yesterday'
    if (d >= weekAgo) return 'Last Week'
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // ─── Activity ───────────────────────────────────────────

  addActivity(
    event: Omit<ActivityEvent, 'id' | 'timestamp'> & { timestamp?: string }
  ): ActivityEvent {
    const full: ActivityEvent = {
      id: uuid(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      type: event.type,
      title: event.title,
      message: event.message,
      projectId: event.projectId,
      projectName: event.projectName,
      metadata: event.metadata,
      level: event.level,
    }
    this.store.activity.unshift(full)
    if (this.store.activity.length > 500) {
      this.store.activity = this.store.activity.slice(0, 500)
    }
    this.persist()
    return full
  }

  getActivity(limit = 100): ActivityEvent[] {
    return this.store.activity.slice(0, limit)
  }

  clearActivity(): void {
    this.store.activity = []
    this.persist()
  }

  // ─── Search ─────────────────────────────────────────────

  indexItem(item: {
    id: string
    type: string
    title: string
    subtitle?: string
    projectId?: string
    projectName?: string
    path?: string
    snippet?: string
    timestamp?: string
    content?: string
  }): void {
    const idx = this.store.searchIndex.findIndex((x) => x.id === item.id)
    const row = {
      ...item,
      content: item.content ?? item.title,
    }
    if (idx >= 0) this.store.searchIndex[idx] = row
    else this.store.searchIndex.push(row)
    this.persist()
  }

  search(query: string, limit = 50) {
    const q = query.toLowerCase()
    return this.store.searchIndex
      .filter((r) => {
        const hay = `${r.title} ${r.subtitle ?? ''} ${r.snippet ?? ''} ${r.content ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, limit)
      .map((r, i) => ({
        id: r.id,
        type: r.type as 'project' | 'chat' | 'prompt' | 'file' | 'message',
        title: r.title,
        subtitle: r.subtitle || '',
        projectId: r.projectId,
        projectName: r.projectName,
        path: r.path,
        snippet: r.snippet,
        timestamp: r.timestamp,
        score: 1 - i * 0.01,
      }))
  }

  close(): void {
    this.persist(true)
  }
}

export const database = new DatabaseService()
