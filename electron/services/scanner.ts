import path from 'node:path'
import fs from 'fs-extra'
import { v4 as uuid } from 'uuid'
import type { AgentId, Project } from '../../shared/types.js'
import { agentRegistry } from '../agents/registry.js'
import { database } from './database.js'
import { detectFramework, dirSize, pathExists } from '../agents/utils.js'
import { getHomeDir } from './paths.js'

/** Markers that strongly imply an AI coding agent used this folder */
const AI_MARKERS: Array<{ file: string; agent: AgentId | null }> = [
  { file: 'CLAUDE.md', agent: 'claude-code' },
  { file: '.claude', agent: 'claude-code' },
  { file: 'AGENTS.md', agent: 'codex' },
  { file: '.codex', agent: 'codex' },
  { file: '.aider.chat.history.md', agent: 'aider' },
  { file: '.aider.conf.yml', agent: 'aider' },
  { file: 'CONVENTIONS.md', agent: 'aider' },
  { file: '.continue', agent: 'continue' },
  { file: 'GEMINI.md', agent: 'gemini' },
  { file: '.gemini', agent: 'gemini' },
  { file: 'opencode.json', agent: 'opencode' },
  { file: '.opencode', agent: 'opencode' },
]

const PROJECT_MARKERS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'AGENTS.md',
  'CLAUDE.md',
  '.git',
  'GEMINI.md',
  '.aider.chat.history.md',
  '.continue',
  '.claude',
]

export class ProjectScanner {
  async scan(): Promise<Project[]> {
    const agents = await agentRegistry.scanAll()
    const projectMap = new Map<string, Project>()

    // 1) Projects discovered directly from each agent (authoritative)
    for (const provider of agentRegistry.all()) {
      try {
        const result = await provider.detect()
        for (const ref of result.projects) {
          await this.mergeProject(projectMap, {
            path: ref.path,
            name: ref.name,
            agentId: provider.id,
            chatCount: ref.chatCount,
            lastOpened: ref.lastOpened,
            framework: ref.framework ?? null,
          })
        }
      } catch (err) {
        console.warn(`[Scanner] ${provider.id} detect failed`, err)
      }
    }

    // 2) Filesystem roots — link AI markers onto projects
    const roots = this.getScanRoots()
    for (const root of roots) {
      if (!(await pathExists(root))) continue
      await this.scanRoot(root, projectMap, 0, 3)
    }

    // 3) Enrich with in-folder AI markers (multi-IDE projects)
    await this.linkLocalAgentMarkers(projectMap)

    // Keep only AI-linked projects
    let projects = Array.from(projectMap.values()).filter((p) => p.agents.length > 0)

    // Persist + replace stale list: remove DB projects that lost all agents
    const keepPaths = new Set(projects.map((p) => p.path))
    for (const existing of database.getProjects()) {
      if (!keepPaths.has(existing.path)) {
        // Soft-clear agents so getProjects filter hides them
        database.updateProject(existing.id, { agents: [] })
      }
    }

    for (const p of projects) {
      database.upsertProject(p)
      database.indexItem({
        id: `project:${p.id}`,
        type: 'project',
        title: p.name,
        subtitle: p.path,
        projectId: p.id,
        projectName: p.name,
        path: p.path,
        content: `${p.name} ${p.path} ${p.framework ?? ''} ${p.agents.join(' ')}`,
        timestamp: p.lastOpened ?? p.updatedAt,
      })
    }

    projects = database.getProjects().filter((p) => p.agents.length > 0)

    database.addActivity({
      type: 'project_discovered',
      title: 'Scan complete',
      message: `Found ${projects.length} projects used with AI tools · ${agents.filter((a) => a.installed).length} tools detected`,
      level: 'info',
      metadata: {
        agents: agents.map((a) => ({
          id: a.id,
          installed: a.installed,
          projects: a.projectCount,
        })),
      },
    })

    return projects
  }

  private getScanRoots(): string[] {
    const home = getHomeDir()
    return [
      path.join(home, 'Projects'),
      path.join(home, 'projects'),
      path.join(home, 'Developer'),
      path.join(home, 'dev'),
      path.join(home, 'code'),
      path.join(home, 'Code'),
      path.join(home, 'src'),
      path.join(home, 'workspace'),
      path.join(home, 'Documents'),
      path.join(home, 'Documents', 'Projects'),
      path.join(home, 'Documents', 'GitHub'),
      path.join(home, 'Documents', 'Github'),
      path.join(home, 'Downloads'),
      // App workspace parent
      path.join(home, 'Documents', 'Projects'),
    ]
  }

  private async scanRoot(
    dir: string,
    map: Map<string, Project>,
    depth: number,
    maxDepth: number
  ): Promise<void> {
    if (depth > maxDepth) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    // Don't treat huge top-level dirs as single projects
    const isProject = depth > 0 && (await this.looksLikeProject(dir))
    if (isProject) {
      const agents = await this.detectLocalAgents(dir)
      if (agents.length > 0) {
        for (const agentId of agents) {
          await this.mergeProject(map, {
            path: dir,
            name: path.basename(dir),
            agentId,
            chatCount: 0,
            lastOpened: null,
            framework: await detectFramework(dir),
          })
        }
      }
      return
    }

    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (
        e.name.startsWith('.') ||
        [
          'node_modules',
          'dist',
          'build',
          'target',
          'vendor',
          'Library',
          'AppData',
          'node_modules',
          'snap',
          'go',
        ].includes(e.name)
      ) {
        continue
      }
      await this.scanRoot(path.join(dir, e.name), map, depth + 1, maxDepth)
    }
  }

  private async looksLikeProject(dir: string): Promise<boolean> {
    for (const marker of PROJECT_MARKERS) {
      if (await pathExists(path.join(dir, marker))) return true
    }
    return false
  }

  private async detectLocalAgents(dir: string): Promise<AgentId[]> {
    const found = new Set<AgentId>()
    for (const m of AI_MARKERS) {
      if (!m.agent) continue
      if (await pathExists(path.join(dir, m.file))) found.add(m.agent)
    }
    return Array.from(found)
  }

  private async linkLocalAgentMarkers(map: Map<string, Project>): Promise<void> {
    for (const [p, project] of map) {
      const agents = await this.detectLocalAgents(p)
      for (const a of agents) {
        if (!project.agents.includes(a)) project.agents.push(a)
      }
      // Aider history chat count
      if (await pathExists(path.join(p, '.aider.chat.history.md'))) {
        project.chatCount = Math.max(project.chatCount, 1)
      }
    }
  }

  private async mergeProject(
    map: Map<string, Project>,
    data: {
      path: string
      name: string
      agentId: AgentId | null
      chatCount: number
      lastOpened: string | null
      framework: string | null
    }
  ): Promise<void> {
    const normalized = path.resolve(data.path)
    if (!(await pathExists(normalized))) return
    // Never list bare home as a project
    if (normalized === getHomeDir()) return

    const existing = map.get(normalized) || database.getProjectByPath(normalized)
    const now = new Date().toISOString()

    if (existing) {
      const agents = new Set(existing.agents)
      if (data.agentId) agents.add(data.agentId)
      const updated: Project = {
        ...existing,
        path: normalized,
        name: data.name || existing.name,
        framework: data.framework || existing.framework,
        agents: Array.from(agents),
        chatCount: Math.max(existing.chatCount, data.chatCount),
        lastOpened: data.lastOpened || existing.lastOpened,
        // Keep prior size; expensive full-tree size is deferred
        sizeBytes: existing.sizeBytes || 0,
        updatedAt: now,
      }
      map.set(normalized, updated)
    } else {
      const project: Project = {
        id: uuid(),
        name: data.name,
        path: normalized,
        framework: data.framework,
        agents: data.agentId ? [data.agentId] : [],
        chatCount: data.chatCount,
        sizeBytes: 0,
        lastOpened: data.lastOpened,
        lastBackup: null,
        protected: true,
        createdAt: now,
        updatedAt: now,
      }
      map.set(normalized, project)
    }
  }

  /** Optional background size refresh (not on critical scan path) */
  async refreshSizes(limit = 20): Promise<void> {
    const projects = database.getProjects().slice(0, limit)
    for (const p of projects) {
      if (p.sizeBytes > 0) continue
      try {
        const size = await dirSize(p.path)
        database.updateProject(p.id, { sizeBytes: size })
      } catch {
        /* skip */
      }
    }
  }
}

export const projectScanner = new ProjectScanner()
