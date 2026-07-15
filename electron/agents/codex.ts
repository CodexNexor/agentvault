import path from 'node:path'
import fs from 'fs-extra'
import type {
  AgentBackupArtifact,
  AgentBackupContext,
  AgentDetectionResult,
  AgentProvider,
  AgentRestoreContext,
  PathRepairReport,
} from './types.js'
import {
  countFiles,
  detectFramework,
  extractCwdsFromJsonl,
  firstExisting,
  isMeaningfulProjectPath,
  pathExists,
  platformPaths,
  querySqliteRows,
  repairPathsInTree,
  tryExec,
  tryReadJson,
} from './utils.js'
import { getHomeDir } from '../services/paths.js'

export class CodexProvider implements AgentProvider {
  readonly id = 'codex' as const
  readonly name = 'Codex CLI'
  readonly description = 'OpenAI Codex CLI coding agent'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [path.join(home, '.codex'), path.join(home, '.config', 'codex')],
        [
          path.join(home, '.codex'),
          path.join(process.env.APPDATA || '', 'Codex'),
          path.join(process.env.USERPROFILE || home, '.codex'),
        ],
        [path.join(home, '.codex'), path.join(home, 'Library', 'Application Support', 'Codex')]
      )
    )

    const versionOut = await tryExec('codex', ['--version'])
    const version = versionOut?.match(/[\d.]+/)?.[0] ?? null
    const installed = Boolean(storagePath || versionOut)

    const projectMap = new Map<
      string,
      { name: string; path: string; chatCount: number; lastOpened: string | null }
    >()
    let conversationCount = 0

    const addProject = (raw: string, chats = 1, lastOpened: string | null = null) => {
      if (!raw || !isMeaningfulProjectPath(raw)) return
      const key = path.resolve(raw)
      const prev = projectMap.get(key)
      projectMap.set(key, {
        name: path.basename(key),
        path: key,
        chatCount: (prev?.chatCount || 0) + chats,
        lastOpened: lastOpened || prev?.lastOpened || null,
      })
    }

    if (storagePath) {
      for (const d of ['sessions', 'history', 'conversations', 'threads', 'chats']) {
        const p = path.join(storagePath, d)
        if (await pathExists(p)) {
          conversationCount += await countFiles(p, ['.json', '.jsonl', '.db', '.sqlite'])
        }
      }

      // SQLite state (modern Codex)
      for (const dbName of ['state_5.sqlite', 'state.sqlite', 'state_4.sqlite']) {
        const dbPath = path.join(storagePath, dbName)
        if (!(await pathExists(dbPath))) continue
        const rows = querySqliteRows(
          dbPath,
          `SELECT cwd, COUNT(*) as c, MAX(updated_at) as last_at
           FROM threads
           WHERE cwd IS NOT NULL AND cwd != ''
           GROUP BY cwd`
        )
        for (const row of rows) {
          const cwd = String(row.cwd || '')
          if (!(await pathExists(cwd))) continue
          addProject(cwd, Number(row.c) || 1, (row.last_at as string) || null)
        }
      }

      // Session jsonl — limited walk (avoid OOM on huge session trees)
      const sessionsDir = path.join(storagePath, 'sessions')
      if (await pathExists(sessionsDir)) {
        let walked = 0
        const maxFiles = 40
        await this.walkJsonl(sessionsDir, async (file) => {
          if (walked >= maxFiles) return
          walked++
          conversationCount++
          const cwds = await extractCwdsFromJsonl(file)
          for (const cwd of cwds) {
            if (await pathExists(cwd)) addProject(cwd, 1)
          }
        })
      }

      // history.jsonl
      const historyFile = path.join(storagePath, 'history.jsonl')
      if (await pathExists(historyFile)) {
        for (const cwd of await extractCwdsFromJsonl(historyFile, 200)) {
          if (await pathExists(cwd)) addProject(cwd, 1)
        }
      }

      // projects.json if present
      const projectsMeta = path.join(storagePath, 'projects.json')
      const meta = await tryReadJson<Record<string, unknown> | Array<Record<string, unknown>>>(
        projectsMeta
      )
      if (Array.isArray(meta)) {
        for (const item of meta) {
          const p = (item.path || item.cwd || item.workspace) as string | undefined
          if (p && (await pathExists(p))) addProject(p)
        }
      } else if (meta && typeof meta === 'object') {
        for (const [key, val] of Object.entries(meta)) {
          const item = val as Record<string, unknown>
          const p = (item.path as string) || key
          if (p && (await pathExists(p))) addProject(p)
        }
      }
    }

    const projects = []
    for (const p of projectMap.values()) {
      if (!(await pathExists(p.path))) continue
      projects.push({
        ...p,
        framework: await detectFramework(p.path),
      })
    }

    return {
      installed,
      version,
      storagePath,
      configPath: storagePath
        ? await firstExisting([
            path.join(storagePath, 'config.toml'),
            path.join(storagePath, 'config.json'),
            path.join(storagePath, 'settings.json'),
          ])
        : null,
      projectCount: projects.length,
      conversationCount: Math.max(conversationCount, projects.reduce((s, p) => s + p.chatCount, 0)),
      lastActivity: null,
      projects,
    }
  }

  private async walkJsonl(
    dir: string,
    onFile: (file: string) => Promise<void>,
    depth = 0
  ): Promise<void> {
    if (depth > 6) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await this.walkJsonl(full, onFile, depth + 1)
      else if (e.name.endsWith('.jsonl') || e.name.endsWith('.json')) await onFile(full)
    }
  }

  async backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]> {
    const artifacts: AgentBackupArtifact[] = []
    const detection = await this.detect()
    if (!detection.storagePath) return artifacts

    const storage = detection.storagePath
    for (const c of [
      'config.json',
      'config.toml',
      'settings.json',
      'projects.json',
      'history.jsonl',
      'auth.json',
      'AGENTS.md',
    ]) {
      const full = path.join(storage, c)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'codex', c),
          sourcePath: full,
          kind: 'file',
        })
      }
    }

    for (const d of ['sessions', 'history', 'conversations', 'threads', 'workspaces', 'memories']) {
      const full = path.join(storage, d)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'codex', d),
          sourcePath: full,
          kind: 'dir',
        })
      }
    }

    // SQLite state
    for (const db of ['state_5.sqlite', 'state.sqlite', 'memories_1.sqlite', 'goals_1.sqlite']) {
      const full = path.join(storage, db)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'codex', db),
          sourcePath: full,
          kind: 'file',
        })
      }
    }

    for (const name of ['AGENTS.md', 'agents.md', '.codex']) {
      const full = path.join(ctx.workspacePath, name)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('project', name),
          sourcePath: full,
          kind: (await fs.stat(full)).isDirectory() ? 'dir' : 'file',
        })
      }
    }

    return artifacts
  }

  async restore(ctx: AgentRestoreContext): Promise<void> {
    const agentDir = path.join(ctx.extractDir, 'agents', 'codex')
    if (!(await pathExists(agentDir))) return

    const target = path.join(getHomeDir(), '.codex')
    await fs.ensureDir(target)
    await fs.copy(agentDir, target, { overwrite: true })

    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const targets = [
      path.join(getHomeDir(), '.codex'),
      path.join(ctx.extractDir, 'agents', 'codex'),
      ctx.projectPath,
    ]
    let filesScanned = 0
    let replacements = 0
    const details: PathRepairReport['details'] = []

    for (const t of targets) {
      if (!(await pathExists(t))) continue
      const r = await repairPathsInTree(t, ctx.oldPaths, ctx.newPath)
      filesScanned += r.filesScanned
      replacements += r.replacements
      details.push(...r.details)
    }

    return { filesScanned, replacements, details }
  }
}
