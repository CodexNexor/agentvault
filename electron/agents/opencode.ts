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

export class OpenCodeProvider implements AgentProvider {
  readonly id = 'opencode' as const
  readonly name = 'OpenCode'
  readonly description = 'OpenCode AI coding agent'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [
          path.join(home, '.local', 'share', 'opencode'),
          path.join(home, '.opencode'),
          path.join(home, '.config', 'opencode'),
          path.join(home, '.cache', 'opencode'),
        ],
        [
          path.join(home, '.opencode'),
          path.join(process.env.APPDATA || '', 'opencode'),
          path.join(process.env.LOCALAPPDATA || '', 'opencode'),
        ],
        [
          path.join(home, '.local', 'share', 'opencode'),
          path.join(home, '.opencode'),
          path.join(home, 'Library', 'Application Support', 'opencode'),
        ]
      )
    )

    const configPath = await firstExisting(
      platformPaths(
        [
          path.join(home, '.config', 'opencode', 'opencode.jsonc'),
          path.join(home, '.config', 'opencode', 'opencode.json'),
          path.join(home, '.config', 'opencode', 'config.json'),
        ],
        [
          path.join(process.env.APPDATA || '', 'opencode', 'config.json'),
        ],
        [
          path.join(home, '.config', 'opencode', 'opencode.jsonc'),
          path.join(home, 'Library', 'Application Support', 'opencode', 'config.json'),
        ]
      )
    )

    const versionOut = await tryExec('opencode', ['--version'])
    const version = versionOut?.match(/[\d.]+/)?.[0] ?? null
    const installed = Boolean(storagePath || configPath || versionOut)

    const projectMap = new Map<
      string,
      { name: string; path: string; chatCount: number; lastOpened: string | null }
    >()

    const addProject = (
      raw: string,
      name?: string | null,
      chats = 1,
      lastOpened: string | null = null
    ) => {
      if (!raw || !isMeaningfulProjectPath(raw)) return
      const key = path.resolve(raw)
      const prev = projectMap.get(key)
      projectMap.set(key, {
        name: name || path.basename(key),
        path: key,
        chatCount: (prev?.chatCount || 0) + chats,
        lastOpened: lastOpened || prev?.lastOpened || null,
      })
    }

    let conversationCount = 0

    if (storagePath) {
      for (const d of ['sessions', 'history', 'projects', 'data', 'storage', 'snapshot']) {
        const p = path.join(storagePath, d)
        if (await pathExists(p)) {
          conversationCount += await countFiles(p, ['.json', '.jsonl', '.db', '.sqlite'])
        }
      }

      // Primary: opencode.db (limit rows — DB can be multi‑GB)
      const dbPath = path.join(storagePath, 'opencode.db')
      if (await pathExists(dbPath)) {
        try {
          const projects = querySqliteRows(
            dbPath,
            `SELECT id, name, worktree, time_updated FROM project
             WHERE worktree IS NOT NULL AND worktree != '' AND worktree != '/'
             LIMIT 200`
          )
          for (const row of projects) {
            const wt = String(row.worktree || '')
            if (await pathExists(wt)) {
              addProject(wt, (row.name as string) || null, 1, (row.time_updated as string) || null)
            }
          }

          const sessions = querySqliteRows(
            dbPath,
            `SELECT directory, COUNT(*) as c, MAX(time_updated) as last_at
             FROM session
             WHERE directory IS NOT NULL AND directory != ''
             GROUP BY directory
             LIMIT 200`
          )
          for (const row of sessions) {
            const dir = String(row.directory || '')
            if (await pathExists(dir)) {
              conversationCount += Number(row.c) || 0
              addProject(dir, null, Number(row.c) || 1, (row.last_at as string) || null)
            }
          }
        } catch (err) {
          console.warn('[OpenCode] sqlite scan skipped:', err)
        }
      }

      // JSON project lists
      for (const projectsFile of [
        path.join(storagePath, 'projects.json'),
        path.join(storagePath, 'data', 'projects.json'),
      ]) {
        if (!(await pathExists(projectsFile))) continue
        const meta = await tryReadJson<unknown>(projectsFile)
        const list = Array.isArray(meta)
          ? meta
          : meta && typeof meta === 'object'
            ? Object.values(meta as object)
            : []
        for (const item of list as Array<Record<string, unknown>>) {
          const p = (item.path || item.directory || item.root || item.worktree) as
            | string
            | undefined
          if (p && (await pathExists(p))) addProject(p, (item.name as string) || null)
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
      configPath,
      projectCount: projects.length,
      conversationCount: Math.max(
        conversationCount,
        projects.reduce((s, p) => s + p.chatCount, 0)
      ),
      lastActivity: null,
      projects,
    }
  }

  async backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]> {
    const artifacts: AgentBackupArtifact[] = []
    const detection = await this.detect()
    if (!detection.storagePath) return artifacts

    const storage = detection.storagePath
    for (const c of [
      'config.json',
      'opencode.json',
      'opencode.jsonc',
      'settings.json',
      'projects.json',
      'auth.json',
      'account.json',
      'opencode.db',
    ]) {
      const full = path.join(storage, c)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'opencode', c),
          sourcePath: full,
          kind: 'file',
        })
      }
    }
    for (const d of ['sessions', 'history', 'projects', 'data', 'mcp', 'storage', 'snapshot']) {
      const full = path.join(storage, d)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'opencode', d),
          sourcePath: full,
          kind: 'dir',
        })
      }
    }

    // Config dir
    const configDir = path.join(getHomeDir(), '.config', 'opencode')
    if (await pathExists(configDir)) {
      artifacts.push({
        relativePath: path.join('agents', 'opencode', 'config-dir'),
        sourcePath: configDir,
        kind: 'dir',
      })
    }

    for (const name of ['AGENTS.md', 'opencode.json', '.opencode']) {
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
    const agentDir = path.join(ctx.extractDir, 'agents', 'opencode')
    if (!(await pathExists(agentDir))) return
    const target = path.join(getHomeDir(), '.local', 'share', 'opencode')
    await fs.ensureDir(target)
    // Prefer sharing storage layout
    for (const name of await fs.readdir(agentDir)) {
      if (name === 'config-dir') {
        await fs.copy(path.join(agentDir, name), path.join(getHomeDir(), '.config', 'opencode'), {
          overwrite: true,
        })
      } else {
        await fs.copy(path.join(agentDir, name), path.join(target, name), { overwrite: true })
      }
    }
    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const targets = [
      path.join(getHomeDir(), '.local', 'share', 'opencode'),
      path.join(getHomeDir(), '.opencode'),
      path.join(getHomeDir(), '.config', 'opencode'),
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
