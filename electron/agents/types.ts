import type { AgentId, Project } from '../../shared/types.js'

export interface AgentDetectionResult {
  installed: boolean
  version: string | null
  storagePath: string | null
  configPath: string | null
  projectCount: number
  conversationCount: number
  lastActivity: string | null
  projects: AgentProjectRef[]
}

export interface AgentProjectRef {
  name: string
  path: string
  chatCount: number
  lastOpened: string | null
  framework?: string | null
}

export interface AgentBackupArtifact {
  /** Relative path inside the backup archive */
  relativePath: string
  /** Absolute source path on disk */
  sourcePath: string
  /** Optional inline content instead of file */
  content?: string | Buffer
  kind: 'file' | 'dir' | 'inline'
}

export interface AgentBackupContext {
  project: Project
  workspacePath: string
  tempDir: string
  excludePatterns: string[]
}

export interface AgentRestoreContext {
  projectPath: string
  extractDir: string
  oldPaths: string[]
  newPath: string
}

export interface PathRepairReport {
  filesScanned: number
  replacements: number
  details: Array<{ file: string; count: number }>
}

/**
 * Plugin interface for AI coding agent adapters.
 * Implement this to add support for a new tool.
 */
export interface AgentProvider {
  readonly id: AgentId
  readonly name: string
  readonly description: string

  /** Detect installation and discover projects/conversations */
  detect(): Promise<AgentDetectionResult>

  /** Collect agent-specific files for a project backup */
  backup(ctx: AgentBackupContext): Promise<AgentBackupArtifact[]>

  /** Restore agent-specific data after archive extraction */
  restore(ctx: AgentRestoreContext): Promise<void>

  /** Repair absolute paths inside history DBs / JSON after restore */
  repairPaths(ctx: AgentRestoreContext): Promise<PathRepairReport>

  /** Optional: restart the agent after restore */
  restart?(): Promise<void>
}
