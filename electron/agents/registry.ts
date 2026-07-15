import type { AgentProvider } from './types.js'
import type { AgentId, DetectedAgent } from '../../shared/types.js'
import { CodexProvider } from './codex.js'
import { OpenCodeProvider } from './opencode.js'
import { ClaudeCodeProvider } from './claude-code.js'
import { ContinueProvider } from './continue.js'
import { AiderProvider } from './aider.js'
import { GeminiProvider } from './gemini.js'
import { database } from '../services/database.js'

/**
 * Plugin registry for AI coding agent adapters.
 * Adding a new agent: implement AgentProvider and register here.
 */
class AgentRegistry {
  private providers = new Map<AgentId, AgentProvider>()

  constructor() {
    this.register(new CodexProvider())
    this.register(new OpenCodeProvider())
    this.register(new ClaudeCodeProvider())
    this.register(new ContinueProvider())
    this.register(new AiderProvider())
    this.register(new GeminiProvider())
  }

  register(provider: AgentProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: AgentId): AgentProvider | undefined {
    return this.providers.get(id)
  }

  all(): AgentProvider[] {
    return Array.from(this.providers.values())
  }

  async scanAll(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = []

    for (const provider of this.all()) {
      try {
        const detected = await provider.detect()
        const agent: DetectedAgent = {
          id: provider.id,
          name: provider.name,
          installed: detected.installed,
          version: detected.version,
          storagePath: detected.storagePath,
          configPath: detected.configPath,
          projectCount: detected.projectCount,
          conversationCount: detected.conversationCount,
          lastActivity: detected.lastActivity,
        }
        database.upsertAgent(agent)
        results.push(agent)
      } catch (err) {
        const agent: DetectedAgent = {
          id: provider.id,
          name: provider.name,
          installed: false,
          version: null,
          storagePath: null,
          configPath: null,
          projectCount: 0,
          conversationCount: 0,
          lastActivity: null,
        }
        database.upsertAgent(agent)
        results.push(agent)
        console.error(`[AgentVault] Failed to detect ${provider.id}:`, err)
      }
    }

    return results
  }
}

export const agentRegistry = new AgentRegistry()
