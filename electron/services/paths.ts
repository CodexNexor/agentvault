import { app } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'

export function getUserDataDir(): string {
  try {
    return app.getPath('userData')
  } catch {
    return path.join(os.homedir(), '.agentvault')
  }
}

export function getAppPaths() {
  const root = getUserDataDir()
  return {
    root,
    db: path.join(root, 'agentvault.db'),
    keys: path.join(root, 'keys'),
    backups: path.join(root, 'backups'),
    cache: path.join(root, 'cache'),
    temp: path.join(root, 'temp'),
    imports: path.join(root, 'imports'),
    logs: path.join(root, 'logs'),
  }
}

export async function ensureAppDirs(): Promise<void> {
  const paths = getAppPaths()
  await Promise.all(
    Object.values(paths).map((p) =>
      typeof p === 'string' && !p.endsWith('.db') ? fs.ensureDir(p) : Promise.resolve()
    )
  )
  await fs.ensureDir(path.dirname(paths.db))
}

export function getHomeDir(): string {
  return os.homedir()
}

export function getPlatform(): 'windows' | 'linux' | 'macos' {
  const p = process.platform
  if (p === 'win32') return 'windows'
  if (p === 'darwin') return 'macos'
  return 'linux'
}

export function getComputerName(): string {
  return os.hostname()
}

/** Common AI agent config locations per platform */
export function getAgentSearchRoots(): string[] {
  const home = getHomeDir()
  const platform = getPlatform()
  const roots = [
    home,
    path.join(home, '.config'),
    path.join(home, '.local', 'share'),
  ]

  if (platform === 'macos') {
    roots.push(path.join(home, 'Library', 'Application Support'))
    roots.push(path.join(home, 'Library', 'Preferences'))
  }
  if (platform === 'windows') {
    roots.push(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
    roots.push(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'))
  }

  return roots
}
