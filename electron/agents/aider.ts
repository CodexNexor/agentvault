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
} from './utils.js'
import { getHomeDir } from '../services/paths.js'

export class AiderProvider implements AgentProvider {
  readonly id = 'aider' as const
  readonly name = 'Aider'
  readonly description = 'Aider AI pair programming in your terminal'

  async detect(): Promise<AgentDetectionResult> {
    const home = getHomeDir()
    const storagePath = await firstExisting(
      platformPaths(
        [path.join(home, '.aider'), path.join(home, '.config', 'aider')],
        [path.join(home, '.aider'), path.join(process.env.USERPROFILE || home, '.aider')],
        [path.join(home, '.aider')]
      )
    )

    const versionOut = await tryExec('aider', ['--version'])
    const version = versionOut?.match(/[\d.]+/)?.[0] ?? null
    const installed = Boolean(storagePath || versionOut)

    // Aider stores chat history in project dirs (.aider.chat.history.md)
    // We discover via common project roots later in scanner
    return {
      installed,
      version,
      storagePath,
      configPath: storagePath
        ? await firstExisting([
            path.join(storagePath, 'config.yml'),
            path.join(home, '.aider.conf.yml'),
          ])
        : (await pathExists(path.join(home, '.aider.conf.yml')))
          ? path.join(home, '.aider.conf.yml')
          : null,
      projectCount: 0,
      conversationCount: storagePath
        ? await countFiles(storagePath, ['.md', '.json', '.yml'])
        : 0,
      lastActivity: null,
      projects: [],
    }
  }

  async backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]> {
    const artifacts: AgentBackupArtifact[] = []
    const home = getHomeDir()

    for (const c of [
      path.join(home, '.aider.conf.yml'),
      path.join(home, '.aider'),
    ]) {
      if (await pathExists(c)) {
        const st = await fs.stat(c)
        artifacts.push({
          relativePath: path.join('agents', 'aider', path.basename(c)),
          sourcePath: c,
          kind: st.isDirectory() ? 'dir' : 'file',
        })
      }
    }

    // Project-local aider files
    const names = [
      '.aider.chat.history.md',
      '.aider.input.history',
      '.aider.tags.cache.v4',
      '.aider.conf.yml',
      'CONVENTIONS.md',
    ]
    for (const name of names) {
      const full = path.join(ctx.workspacePath, name)
      if (await pathExists(full)) {
        artifacts.push({
          relativePath: path.join('project', name),
          sourcePath: full,
          kind: 'file',
        })
      }
    }
    return artifacts
  }

  async restore(ctx: AgentRestoreContext): Promise<void> {
    const agentDir = path.join(ctx.extractDir, 'agents', 'aider')
    if (await pathExists(agentDir)) {
      const conf = path.join(agentDir, '.aider.conf.yml')
      if (await pathExists(conf)) {
        await fs.copy(conf, path.join(getHomeDir(), '.aider.conf.yml'), { overwrite: true })
      }
      const aiderDir = path.join(agentDir, '.aider')
      if (await pathExists(aiderDir)) {
        await fs.copy(aiderDir, path.join(getHomeDir(), '.aider'), { overwrite: true })
      }
    }
    const projectDir = path.join(ctx.extractDir, 'project')
    if (await pathExists(projectDir)) {
      await fs.copy(projectDir, ctx.projectPath, { overwrite: false })
    }
  }

  async repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport> {
    const r = await repairPathsInTree(ctx.projectPath, ctx.oldPaths, ctx.newPath, [
      '.md',
      '.yml',
      '.yaml',
      '.json',
    ])
    return { filesScanned: r.filesScanned, replacements: r.replacements, details: r.details }
  }
}
