import type { StorageAnalytics } from '../../shared/types.js'
import { database } from './database.js'

export function getStorageAnalytics(): StorageAnalytics {
  const backups = database.getBackups()
  const projects = database.getProjects()

  const totalLocalBytes = backups.reduce((s, b) => s + (b.compressedBytes || 0), 0)
  const totalCloudBytes = backups
    .filter((b) => b.location === 'cloud' || b.location === 'both')
    .reduce((s, b) => s + (b.compressedBytes || 0), 0)

  const ratios = backups.map((b) => b.compressionRatio).filter((r) => r > 0)
  const averageCompressionRatio =
    ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 1

  const byProjectMap = new Map<string, { projectId: string; name: string; bytes: number }>()
  for (const b of backups) {
    const cur = byProjectMap.get(b.projectId) || {
      projectId: b.projectId,
      name: b.projectName,
      bytes: 0,
    }
    cur.bytes += b.compressedBytes
    byProjectMap.set(b.projectId, cur)
  }

  // Last 14 days history
  const history: Array<{ date: string; bytes: number }> = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const dayBytes = backups
      .filter((b) => b.createdAt.startsWith(key))
      .reduce((s, b) => s + b.compressedBytes, 0)
    history.push({ date: key, bytes: dayBytes })
  }

  return {
    totalLocalBytes,
    totalCloudBytes,
    backupCount: backups.length,
    projectCount: projects.length,
    averageCompressionRatio,
    byProject: Array.from(byProjectMap.values()).sort((a, b) => b.bytes - a.bytes),
    history,
  }
}
