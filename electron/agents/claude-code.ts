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
  decodeClaudeProjectPath,
  detectFramework,
  extractCwdsFromJsonl,
  firstExisting,
  isMeaningfulProjectPath,
  listSubdirs,
  pathExists,
  platformPaths,
  repairPathsInTree,
  tryExec,
} from './utils.js'
import { getHomeDir } from '../services/paths.js'

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code' as const
  readonly name = 'Claude Code'
  readonly description = 'Anthropic Claude Code CLI'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [
          path.join(home, '.claude'),
          path.join(home, '.config', 'claude'),
          path.join(home, '.config', 'claude-code'),
        ],
        [
          path.join(home, '.claude'),
          path.join(process.env.APPDATA || '', 'claude'),
          path.join(process.env.APPDATA || '', 'Claude'),
        ],
        [
          path.join(home, '.claude'),
          path.join(home, 'Library', 'Application Support', 'Claude'),
          path.join(home, 'Library', 'Application Support', 'claude-code'),
        ]
      )
    )

    const versionOut =
      (await tryExec('claude', ['--version'])) ||
      (await tryExec('claude-code', ['--version']))
    const version = versionOut?.match(/[\d.]+/)?.[0] ?? null
    const installed = Boolean(storagePath || versionOut)

    const projectMap = new Map<
      string,
      { name: string; path: string; chatCount: number; lastOpened: string | null }
    >()
    let conversationCount = 0

    if (storagePath) {
      for (const d of ['projects', 'sessions', 'history', 'conversations', 'todos']) {
        const p = path.join(storagePath, d)
        if (await pathExists(p)) {
          conversationCount += await countFiles(p, ['.json', '.jsonl', '.db'])
        }
      }

      const projectsDir = path.join(storagePath, 'projects')
      if (await pathExists(projectsDir)) {
        const subdirs = await listSubdirs(projectsDir)
        for (const sub of subdirs) {
          const base = path.basename(sub)
          let projectPath: string | null = null

          // 1) Prefer cwd from session jsonl (most accurate)
          try {
            const files = await fs.readdir(sub)
            for (const f of files.filter((x) => x.endsWith('.jsonl')).slice(0, 5)) {
              const cwds = await extractCwdsFromJsonl(path.join(sub, f))
              const good = cwds.find((c) => isMeaningfulProjectPath(c))
              if (good) {
                projectPath = good
                break
              }
            }
          } catch {
            /* continue */
          }

          // 2) Decode Claude encoded folder name against real filesystem
          if (!projectPath) {
            projectPath = decodeClaudeProjectPath(base)
          }

          if (projectPath && isMeaningfulProjectPath(projectPath) && (await pathExists(projectPath))) {
            const chatCount = await countFiles(sub, ['.json', '.jsonl'])
            const key = path.resolve(projectPath)
            const prev = projectMap.get(key)
            projectMap.set(key, {
              name: path.basename(projectPath),
              path: key,
              chatCount: (prev?.chatCount || 0) + chatCount,
              lastOpened: prev?.lastOpened || null,
            })
          } else {
            conversationCount += await countFiles(sub, ['.json', '.jsonl'])
          }
        }
      }

      // history.jsonl at storage root may also list paths
      const historyFile = path.join(storagePath, 'history.jsonl')
      if (await pathExists(historyFile)) {
        const cwds = await extractCwdsFromJsonl(historyFile, 100)
        for (const cwd of cwds) {
          if (!isMeaningfulProjectPath(cwd) || !(await pathExists(cwd))) continue
          const key = path.resolve(cwd)
          if (!projectMap.has(key)) {
            projectMap.set(key, {
              name: path.basename(cwd),
              path: key,
              chatCount: 1,
              lastOpened: null,
            })
          }
        }
      }
    }

    const projects = []
    for (const p of projectMap.values()) {
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
            path.join(storagePath, 'settings.json'),
            path.join(storagePath, 'config.json'),
            path.join(storagePath, '.claude.json'),
          ])
        : null,
      projectCount: projects.length,
      conversationCount: conversationCount + projects.reduce((s, p) => s + p.chatCount, 0),
      lastActivity: null,
      projects,
    }
  }

  async backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]> {
    const artifacts: AgentBackupArtifact[] = []
    const detection = await this.detect()
    if (!detection.storagePath) return artifacts

    const storage = detection.storagePath
    for (const c of ['settings.json', 'config.json', '.claude.json', 'CLAUDE.md', 'history.jsonl']) {
      const full = path.join(storage, c)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'claude-code', c),
          sourcePath: full,
          kind: 'file',
        })
      }
    }

    // Only the project-specific encoded folder when possible
    const projectsDir = path.join(storage, 'projects')
    if (await pathExists(projectsDir)) {
      const encoded = path.resolve(ctx.workspacePath).replace(/\//g, '-')
      // Claude uses leading - for absolute paths: /home/... → -home-...
      const candidates = [
        path.join(projectsDir, encoded.startsWith('-') ? encoded : `-${encoded.replace(/^-/, '')}`),
        path.join(projectsDir, '-' + path.resolve(ctx.workspacePath).slice(1).replace(/\//g, '-')),
      ]
      let copied = false
      for (const full of candidates) {
        if (await pathExists(full)) {
          artifacts.push({
            relativePath: path.join('agents', 'claude-code', 'projects', path.basename(full)),
            sourcePath: full,
            kind: 'dir',
          })
          copied = true
          break
        }
      }
      if (!copied) {
        // Fallback: whole projects tree (still better than nothing)
        artifacts.push({
          relativePath: path.join('agents', 'claude-code', 'projects'),
          sourcePath: projectsDir,
          kind: 'dir',
        })
      }
    }

    for (const d of ['sessions', 'history', 'conversations', 'todos']) {
      const full = path.join(storage, d)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'claude-code', d),
          sourcePath: full,
          kind: 'dir',
        })
      }
    }

    for (const name of ['CLAUDE.md', '.claude', 'AGENTS.md']) {
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
    const agentDir = path.join(ctx.extractDir, 'agents', 'claude-code')
    if (!(await pathExists(agentDir))) return

    const target = path.join(getHomeDir(), '.claude')
    await fs.ensureDir(target)
    await fs.copy(agentDir, target, { overwrite: true })

    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const targets = [path.join(getHomeDir(), '.claude'), ctx.projectPath]
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
