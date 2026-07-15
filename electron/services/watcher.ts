import chokidar, { type FSWatcher } from 'chokidar'
import path from 'node:path'
import { database } from './database.js'
import { backupEngine } from './backup-engine.js'
import { agentRegistry } from '../agents/registry.js'
import type { AutoBackupInterval } from '../../shared/types.js'
import type { BrowserWindow } from 'electron'

const INTERVAL_MS: Record<Exclude<AutoBackupInterval, 'manual'>, number> = {
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
}

/**
 * Background auto-backup watcher.
 * Detects conversation / project changes and schedules backups.
 */
export class AutoBackupWatcher {
  private watchers: FSWatcher[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private dirtyProjects = new Set<string>()
  private running = false
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  async start(): Promise<void> {
    await this.stop()
    const settings = database.getSettings()
    if (!settings.autoBackup || settings.autoBackupInterval === 'manual') {
      return
    }

    this.running = true
    const interval = INTERVAL_MS[settings.autoBackupInterval]

    // Watch agent storage dirs for conversation changes
    const agents = database.getAgents()
    const watchPaths: string[] = []
    for (const a of agents) {
      if (a.installed && a.storagePath) watchPaths.push(a.storagePath)
    }

    // Watch project roots lightly
    for (const p of database.getProjects()) {
      for (const marker of [
        'AGENTS.md',
        'CLAUDE.md',
        '.aider.chat.history.md',
        '.continue',
      ]) {
        watchPaths.push(path.join(p.path, marker))
      }
    }

    if (watchPaths.length > 0) {
      const watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
        ignored: [
          /node_modules/,
          /\.git/,
          /dist/,
          /build/,
          /\.cache/,
        ],
        depth: 4,
      })

      watcher.on('change', (filePath) => this.onChange(filePath))
      watcher.on('add', (filePath) => this.onChange(filePath))
      this.watchers.push(watcher)
    }

    this.timer = setInterval(() => {
      void this.flushDirty()
    }, interval)

    console.log(
      `[AgentVault] Auto-backup watcher started (${settings.autoBackupInterval})`
    )
  }

  private onChange(filePath: string): void {
    const projects = database.getProjects()
    const hit = projects.find(
      (p) => filePath.startsWith(p.path) || this.agentPathMatches(filePath, p.id)
    )

    database.addActivity({
      type: 'conversation_changed',
      title: 'Conversation updated',
      message: path.basename(filePath),
      projectId: hit?.id,
      projectName: hit?.name,
      level: 'info',
    })

    if (hit) {
      this.dirtyProjects.add(hit.id)
      this.mainWindow?.webContents.send('toast', {
        type: 'info',
        title: 'Conversation Synced',
        message: `Change detected in ${hit.name}`,
      })
    }
  }

  private agentPathMatches(_filePath: string, _projectId: string): boolean {
    // Agent storage is global; mark all protected projects dirty lightly
    return false
  }

  private async flushDirty(): Promise<void> {
    if (this.dirtyProjects.size === 0) return
    if (backupEngine.getProgress()) return // already running

    const ids = Array.from(this.dirtyProjects)
    this.dirtyProjects.clear()

    for (const id of ids) {
      try {
        await backupEngine.backupProject(id)
      } catch (err) {
        console.error('[AutoBackup] failed for', id, err)
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    for (const w of this.watchers) {
      await w.close()
    }
    this.watchers = []
  }

  async restart(): Promise<void> {
    await this.start()
  }
}

export const autoBackupWatcher = new AutoBackupWatcher()

// Keep registry import used for future agent-path mapping
void agentRegistry
