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
  pathExists,
  platformPaths,
  repairPathsInTree,
  tryExec,
  tryReadJson,
} from './utils.js'
import { getHomeDir } from '../services/paths.js'

export class GeminiProvider implements AgentProvider {
  readonly id = 'gemini' as const
  readonly name = 'Gemini CLI'
  readonly description = 'Google Gemini CLI coding agent'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [
          path.join(home, '.gemini'),
          path.join(home, '.config', 'gemini'),
          path.join(home, '.config', 'gemini-cli'),
        ],
        [
          path.join(home, '.gemini'),
          path.join(process.env.APPDATA || '', 'gemini'),
          path.join(process.env.APPDATA || '', 'gemini-cli'),
        ],
        [
          path.join(home, '.gemini'),
          path.join(home, 'Library', 'Application Support', 'gemini'),
        ]
      )
    )

    const versionOut =
      (await tryExec('gemini', ['--version'])) ||
      (await tryExec('gemini-cli', ['--version']))
    const version = versionOut?.match(/[\d.]+/)?.[0] ?? null
    const installed = Boolean(storagePath || versionOut)

    const projects: AgentDetectionResult['projects'] = []
    let conversationCount = 0

    if (storagePath) {
      for (const d of ['sessions', 'history', 'conversations', 'tmp', 'projects']) {
        const p = path.join(storagePath, d)
        if (await pathExists(p)) {
          conversationCount += await countFiles(p, ['.json', '.jsonl', '.db'])
        }
      }

      const projectsFile = path.join(storagePath, 'projects.json')
      const meta = await tryReadJson<Array<Record<string, unknown>>>(projectsFile)
      if (Array.isArray(meta)) {
        for (const item of meta) {
          const p = (item.path || item.cwd) as string | undefined
          if (p && (await pathExists(p))) {
            projects.push({
              name: (item.name as string) || path.basename(p),
              path: p,
              chatCount: 0,
              lastOpened: null,
              framework: await detectFramework(p),
            })
          }
        }
      }
    }

    return {
      installed,
      version,
      storagePath,
      configPath: storagePath
        ? await firstExisting([
            path.join(storagePath, 'settings.json'),
            path.join(storagePath, 'config.json'),
            path.join(storagePath, 'gemini.conf'),
          ])
        : null,
      projectCount: projects.length,
      conversationCount,
      lastActivity: null,
      projects,
    }
  }

  async backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]> {
    const artifacts: AgentBackupArtifact[] = []
    const detection = await this.detect()
    if (!detection.storagePath) return artifacts

    const storage = detection.storagePath
    for (const c of ['settings.json', 'config.json', 'gemini.conf', 'projects.json']) {
      const full = path.join(storage, c)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'gemini', c),
          sourcePath: full,
          kind: 'file',
        })
      }
    }
    for (const d of ['sessions', 'history', 'conversations', 'projects', 'mcp']) {
      const full = path.join(storage, d)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'gemini', d),
          sourcePath: full,
          kind: 'dir',
        })
      }
    }

    for (const name of ['GEMINI.md', '.gemini', 'AGENTS.md']) {
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
    const agentDir = path.join(ctx.extractDir, 'agents', 'gemini')
    if (!(await pathExists(agentDir))) return
    const target = path.join(getHomeDir(), '.gemini')
    await fs.ensureDir(target)
    await fs.copy(agentDir, target, { overwrite: true })
    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const r = await repairPathsInTree(
      path.join(getHomeDir(), '.gemini'),
      ctx.oldPaths,
      ctx.newPath
    )
    return { filesScanned: r.filesScanned, replacements: r.replacements, details: r.details }
  }
}
