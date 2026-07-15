import fs from 'fs-extra'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { getHomeDir, getPlatform } from '../services/paths.js'

const execFileAsync = promisify(execFile)

/**
 * Claude Code encodes absolute paths by replacing `/` with `-`.
 * e.g. /home/dheeraj-pc/Documents/ORDON → -home-dheeraj-pc-Documents-ORDON
 * Simple replace breaks on hyphens in folder names — resolve against the real FS.
 */
export function decodeClaudeProjectPath(encoded: string): string | null {
  if (!encoded.startsWith('-')) return null
  const body = encoded.slice(1)
  const candidates: string[] = []

  function search(prefix: string, remaining: string): void {
    if (!remaining) {
      candidates.push(prefix || '/')
      return
    }
    const base = prefix || '/'
    let names: string[]
    try {
      names = fs.readdirSync(base)
    } catch {
      return
    }
    // Prefer longer directory names so "dheeraj-pc" wins over "dheeraj"
    names.sort((a, b) => b.length - a.length)
    for (const name of names) {
      if (remaining === name || remaining.startsWith(name + '-')) {
        let nextRem = remaining.slice(name.length)
        if (nextRem.startsWith('-')) nextRem = nextRem.slice(1)
        else if (nextRem !== '') continue
        const nextPrefix = base === '/' ? `/${name}` : path.join(base, name)
        search(nextPrefix, nextRem)
      }
    }
  }

  search('', body)
  const existing = candidates.filter((c) => {
    try {
      return fs.statSync(c).isDirectory()
    } catch {
      return false
    }
  })
  if (existing.length) return existing.sort((a, b) => b.length - a.length)[0]
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null
}

/** Read cwd fields from Claude/Codex-style jsonl session files */
export async function extractCwdsFromJsonl(
  filePath: string,
  limit = 40
): Promise<string[]> {
  const found = new Set<string>()
  try {
    const text = await fs.readFile(filePath, 'utf8')
    const lines = text.split('\n').slice(0, 200)
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        const cwd =
          (obj.cwd as string) ||
          (obj.working_directory as string) ||
          ((obj.payload as Record<string, unknown> | undefined)?.cwd as string)
        if (typeof cwd === 'string' && cwd.startsWith('/')) found.add(path.resolve(cwd))
        if (found.size >= limit) break
      } catch {
        /* skip bad lines */
      }
    }
  } catch {
    /* ignore */
  }
  return Array.from(found)
}

/** Safe read-only SQLite query (better-sqlite3 optional; falls back to empty) */
export function querySqliteRows(
  dbPath: string,
  sql: string,
  params: unknown[] = []
): Array<Record<string, unknown>> {
  try {
    // Prefer native better-sqlite3 if available; else try node:sqlite
    // Prefer Node built-in sqlite (Electron 33+ / Node 22+), no native rebuild
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (
        path: string,
        opts?: { readOnly?: boolean }
      ) => {
        prepare: (sql: string) => {
          all: (...params: unknown[]) => Array<Record<string, unknown>>
        }
        close: () => void
      }
    }
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      return db.prepare(sql).all(...params)
    } finally {
      db.close()
    }
  } catch (err) {
    console.warn('[sqlite]', dbPath, err instanceof Error ? err.message : err)
    return []
  }
}

/** Skip home / root as "projects" */
export function isMeaningfulProjectPath(p: string): boolean {
  const resolved = path.resolve(p)
  const home = getHomeDir()
  if (resolved === home || resolved === '/' || resolved === path.parse(resolved).root) {
    return false
  }
  // Skip pure Downloads file dumps without markers — still allow known project roots
  return true
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function firstExisting(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    if (await pathExists(p)) return p
  }
  return null
}

export async function tryReadJson<T = unknown>(filePath: string): Promise<T | null> {
  try {
    return (await fs.readJson(filePath)) as T
  } catch {
    return null
  }
}

export async function tryExec(
  cmd: string,
  args: string[] = []
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: 5000,
      env: process.env,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

export async function countFiles(
  dir: string,
  extensions?: string[]
): Promise<number> {
  if (!(await pathExists(dir))) return 0
  let count = 0
  async function walk(d: string) {
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue
        await walk(full)
      } else if (!extensions || extensions.some((ext) => e.name.endsWith(ext))) {
        count++
      }
    }
  }
  await walk(dir)
  return count
}

export async function dirSize(dir: string): Promise<number> {
  if (!(await pathExists(dir))) return 0
  let total = 0
  async function walk(d: string) {
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build'].includes(e.name)) continue
        await walk(full)
      } else {
        try {
          const st = await fs.stat(full)
          total += st.size
        } catch {
          /* skip */
        }
      }
    }
  }
  await walk(dir)
  return total
}

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(getHomeDir(), p.slice(2))
  }
  return p
}

export function platformPaths(unix: string[], windows: string[], macos?: string[]): string[] {
  const platform = getPlatform()
  if (platform === 'windows') return windows.map(expandHome)
  if (platform === 'macos' && macos) return macos.map(expandHome)
  return unix.map(expandHome)
}

export async function detectFramework(projectPath: string): Promise<string | null> {
  const checks: Array<[string, string]> = [
    ['package.json', 'Node.js'],
    ['Cargo.toml', 'Rust'],
    ['go.mod', 'Go'],
    ['pyproject.toml', 'Python'],
    ['requirements.txt', 'Python'],
    ['pom.xml', 'Java'],
    ['build.gradle', 'Java'],
    ['Gemfile', 'Ruby'],
    ['composer.json', 'PHP'],
    ['Package.swift', 'Swift'],
  ]

  for (const [file, name] of checks) {
    if (await pathExists(path.join(projectPath, file))) {
      // Refine Node frameworks
      if (file === 'package.json') {
        const pkg = await tryReadJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
          path.join(projectPath, file)
        )
        const deps = { ...pkg?.dependencies, ...pkg?.devDependencies }
        if (deps?.next) return 'Next.js'
        if (deps?.react) return 'React'
        if (deps?.vue) return 'Vue'
        if (deps?.['@angular/core']) return 'Angular'
        if (deps?.svelte) return 'Svelte'
        if (deps?.electron) return 'Electron'
        if (deps?.express) return 'Express'
      }
      return name
    }
  }
  return null
}

export async function listSubdirs(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name))
  } catch {
    return []
  }
}

/** Walk text files and replace old path prefixes with new ones */
export async function repairPathsInTree(
  root: string,
  oldPaths: string[],
  newPath: string,
  extensions = ['.json', '.jsonl', '.db', '.sqlite', '.sqlite3', '.md', '.txt', '.yml', '.yaml', '.toml']
): Promise<{ filesScanned: number; replacements: number; details: Array<{ file: string; count: number }> }> {
  let filesScanned = 0
  let replacements = 0
  const details: Array<{ file: string; count: number }> = []

  const sortedOld = [...oldPaths].filter(Boolean).sort((a, b) => b.length - a.length)

  async function walk(d: string) {
    let entries
    try {
      entries = await fs.readdir(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'dist'].includes(e.name)) continue
        await walk(full)
      } else {
        const ext = path.extname(e.name).toLowerCase()
        // SQLite files: binary path repair via string replace in raw bytes (careful)
        if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
          filesScanned++
          const count = await repairBinaryPaths(full, sortedOld, newPath)
          if (count > 0) {
            replacements += count
            details.push({ file: full, count })
          }
          continue
        }
        if (!extensions.includes(ext) && !e.name.endsWith('.jsonl')) continue
        filesScanned++
        try {
          let content = await fs.readFile(full, 'utf8')
          let fileCount = 0
          for (const old of sortedOld) {
            if (!content.includes(old)) continue
            const parts = content.split(old)
            fileCount += parts.length - 1
            content = parts.join(newPath)
          }
          if (fileCount > 0) {
            await fs.writeFile(full, content, 'utf8')
            replacements += fileCount
            details.push({ file: full, count: fileCount })
          }
        } catch {
          /* binary or unreadable */
        }
      }
    }
  }

  await walk(root)
  return { filesScanned, replacements, details }
}

async function repairBinaryPaths(
  filePath: string,
  oldPaths: string[],
  newPath: string
): Promise<number> {
  try {
    let buf = await fs.readFile(filePath)
    let total = 0
    for (const old of oldPaths) {
      // Only replace when new path is same or shorter length to avoid SQLite corruption
      // Prefer padding with spaces if shorter... actually safer to skip if lengths differ
      if (Buffer.byteLength(old) !== Buffer.byteLength(newPath)) {
        // Try path normalization variants of same length only
        continue
      }
      const oldBuf = Buffer.from(old)
      const newBuf = Buffer.from(newPath)
      let idx = 0
      while ((idx = buf.indexOf(oldBuf, idx)) !== -1) {
        newBuf.copy(buf, idx)
        total++
        idx += oldBuf.length
      }
    }
    if (total > 0) await fs.writeFile(filePath, buf)
    return total
  } catch {
    return 0
  }
}
