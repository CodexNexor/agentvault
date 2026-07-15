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
  tryReadJson,
} from './utils.js'
import { getHomeDir } from '../services/paths.js'

export class ContinueProvider implements AgentProvider {
  readonly id = 'continue' as const
  readonly name = 'Continue'
  readonly description = 'Continue.dev VS Code / JetBrains extension'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [
          path.join(home, '.continue'),
          path.join(home, '.config', 'continue'),
        ],
        [
          path.join(home, '.continue'),
          path.join(process.env.USERPROFILE || home, '.continue'),
        ],
        [
          path.join(home, '.continue'),
          path.join(home, 'Library', 'Application Support', 'continue'),
        ]
      )
    )

    // Also check VS Code globalStorage
    const vscodeContinue = await firstExisting(
      platformPaths(
        [
          path.join(home, '.config', 'Code', 'User', 'globalStorage', 'continue.continue'),
          path.join(home, '.vscode', 'extensions'),
        ],
        [
          path.join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage', 'continue.continue'),
        ],
        [
          path.join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'continue.continue'),
        ]
      )
    )

    const installed = Boolean(storagePath || vscodeContinue)
    const projects: AgentDetectionResult['projects'] = []
    let conversationCount = 0

    if (storagePath) {
      for (const d of ['sessions', 'index', 'dev_data', 'conversations']) {
        const p = path.join(storagePath, d)
        if (await pathExists(p)) {
          conversationCount += await countFiles(p, ['.json', '.jsonl', '.sqlite'])
        }
      }

      const config = await tryReadJson<{ workspaceDirs?: string[] }>(
        path.join(storagePath, 'config.json')
      )
      if (config?.workspaceDirs) {
        for (const p of config.workspaceDirs) {
          if (await pathExists(p)) {
            projects.push({
              name: path.basename(p),
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
      version: null,
      storagePath: storagePath || vscodeContinue,
      configPath: storagePath
        ? await firstExisting([
            path.join(storagePath, 'config.json'),
            path.join(storagePath, 'config.ts'),
            path.join(storagePath, 'config.yaml'),
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
    for (const c of ['config.json', 'config.ts', 'config.yaml', 'package.json']) {
      const full = path.join(storage, c)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'continue', c),
          sourcePath: full,
          kind: 'file',
        })
      }
    }
    for (const d of ['sessions', 'index', 'dev_data', 'conversations', '.continue']) {
      const full = path.join(storage, d)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('agents', 'continue', d),
          sourcePath: full,
          kind: 'dir',
        })
      }
    }

    const projectContinue = path.join(ctx.workspacePath, '.continue')
    if (await pathExists(projectContinue)) {
      artifacts.push({
        relativePath: path.join('project', '.continue'),
        sourcePath: projectContinue,
        kind: 'dir',
      })
    }
    return artifacts
  }

  async restore(ctx: AgentRestoreContext): Promise<void> {
    const agentDir = path.join(ctx.extractDir, 'agents', 'continue')
    if (!(await pathExists(agentDir))) return
    const target = path.join(getHomeDir(), '.continue')
    await fs.ensureDir(target)
    await fs.copy(agentDir, target, { overwrite: true })
    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const r = await repairPathsInTree(
      path.join(getHomeDir(), '.continue'),
      ctx.oldPaths,
      ctx.newPath
    )
    return { filesScanned: r.filesScanned, replacements: r.replacements, details: r.details }
  }
}
