import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import extractZip from 'extract-zip'
import { v4 as uuid } from 'uuid'
import type { RestoreOptions, RestoreProgress } from '../../shared/types.js'
import { database } from './database.js'
import { encryption } from './encryption.js'
import { getAppPaths } from './paths.js'
import { agentRegistry } from '../agents/registry.js'
import { pathExists } from '../agents/utils.js'
import { googleDrive } from './google-drive.js'
import type { BrowserWindow } from 'electron'

export class RestoreEngine {
  private current: RestoreProgress | null = null
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getProgress(): RestoreProgress | null {
    return this.current
  }

  private emit(progress: RestoreProgress): void {
    this.current = progress
    this.mainWindow?.webContents.send('restore:progress', progress)
  }

  private toast(type: string, title: string, message: string): void {
    this.mainWindow?.webContents.send('toast', { type, title, message })
  }

  /** Default project files land in ~/Downloads/AgentVault-Restores/<name> */
  getDefaultRestorePath(projectName: string): string {
    const safe = projectName.replace(/[^\w\- .]/g, '_').trim() || 'project'
    return path.join(os.homedir(), 'Downloads', 'AgentVault-Restores', safe)
  }

  async restore(
    backupId: string,
    targetPath?: string | null,
    options?: RestoreOptions
  ): Promise<string> {
    let backup = database.getBackup(backupId)
    if (!backup) throw new Error('Backup not found')

    // Auto-resolve project files destination:
    // 1) explicit user path  2) options  3) original path if still useful
    // 4) Downloads/AgentVault-Restores/<name>
    const linked = database.getProject(backup.projectId)
    let resolvedPath =
      (targetPath && targetPath.trim()) ||
      (options?.projectTargetPath && options.projectTargetPath.trim()) ||
      null

    if (!resolvedPath) {
      if (options?.useDownloadsDefault !== false) {
        // After PC reset, original absolute path may not exist — default to Downloads
        const original = backup.projectPath || linked?.path
        if (original && (await pathExists(path.dirname(original)))) {
          resolvedPath = original
        } else {
          resolvedPath = this.getDefaultRestorePath(backup.projectName)
        }
      } else {
        resolvedPath =
          backup.projectPath ||
          linked?.path ||
          this.getDefaultRestorePath(backup.projectName)
      }
    }

    const finalTarget = path.resolve(resolvedPath)

    const restoreId = uuid()
    const paths = getAppPaths()
    const workDir = path.join(paths.temp, `restore-${restoreId}`)
    await fs.ensureDir(workDir)

    database.addActivity({
      type: 'restore_started',
      title: 'Restore started',
      message: `Restoring ${backup.projectName} → ${finalTarget}`,
      projectId: backup.projectId,
      projectName: backup.projectName,
      level: 'info',
    })

    try {
      // Ensure local file
      let localPath = backup.localPath
      if (!localPath || !(await pathExists(localPath))) {
        if (backup.cloudPath) {
          this.emit({
            restoreId,
            backupId,
            projectName: backup.projectName,
            stage: 'downloading',
            progress: 10,
            message: 'Downloading from Google Drive…',
          })
          localPath = path.join(paths.cache, `${backupId}.avault`)
          await googleDrive.downloadBackup(backup.cloudPath, localPath)
        } else {
          throw new Error('Backup file not available locally or in cloud')
        }
      }

      // Prepare ZIP for extract (.avault is plain zip — no keys)
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'decrypting',
        progress: 25,
        message: 'Opening archive…',
      })

      const zipPath = path.join(workDir, 'archive.zip')
      if (await encryption.looksLikeLegacyEncrypted(localPath)) {
        throw new Error(
          'This backup was made with the old encryption format and cannot be opened. ' +
            'Run Complete Backup again on the original machine (new backups need no password).'
        )
      }
      await fs.copy(localPath, zipPath)

      // Extract
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'extracting',
        progress: 40,
        message: 'Extracting files…',
      })

      const extractDir = path.join(workDir, 'extracted')
      await fs.ensureDir(extractDir)
      await extractZip(zipPath, { dir: extractDir })

      // Read manifest
      const manifestPath = path.join(extractDir, 'manifest.json')
      let oldPaths: string[] = []
      if (await pathExists(manifestPath)) {
        const manifest = await fs.readJson(manifestPath)
        oldPaths = manifest.oldPaths || (manifest.project?.path ? [manifest.project.path] : [])
      }

      // Restore workspace files
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'restoring',
        progress: 55,
        message: 'Restoring project files…',
      })

      await fs.ensureDir(finalTarget)
      const workspaceSrc = path.join(extractDir, 'workspace')
      if (await pathExists(workspaceSrc)) {
        await fs.copy(workspaceSrc, finalTarget, { overwrite: true })
      }

      // Agent restore
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'restoring',
        progress: 70,
        message: 'Restoring AI conversations & settings…',
      })

      // Prefer manifest old path; fall back to stored projectPath
      if (oldPaths.length === 0 && backup.projectPath) {
        oldPaths = [backup.projectPath]
      }

      const restoreCtx = {
        projectPath: finalTarget,
        extractDir,
        oldPaths,
        newPath: finalTarget,
      }

      // Only restore IDEs that were included in this backup
      const agentsInBackup = backup.agents?.length
        ? backup.agents
        : agentRegistry.all().map((p) => p.id)

      for (const provider of agentRegistry.all()) {
        if (!agentsInBackup.includes(provider.id)) continue
        // Skip if archive has no data for this agent
        const agentDataDir = path.join(extractDir, 'agents', provider.id)
        if (!(await pathExists(agentDataDir))) {
          // Still try restore for project-level files (aider history etc.)
          if (provider.id !== 'aider') continue
        }
        try {
          await provider.restore(restoreCtx)
        } catch (err) {
          console.warn(`[Restore] Agent ${provider.id}:`, err)
        }
      }

      // Path repair
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'path_repair',
        progress: 85,
        message: 'Repairing file paths for this machine…',
      })

      let totalRepairs = 0
      for (const provider of agentRegistry.all()) {
        if (!agentsInBackup.includes(provider.id)) continue
        try {
          const report = await provider.repairPaths(restoreCtx)
          totalRepairs += report.replacements
        } catch (err) {
          console.warn(`[PathRepair] ${provider.id}:`, err)
        }
      }

      if (totalRepairs > 0) {
        database.addActivity({
          type: 'path_repaired',
          title: 'Paths repaired',
          message: `Updated ${totalRepairs} path references for ${backup.projectName}`,
          projectId: backup.projectId,
          projectName: backup.projectName,
          level: 'success',
        })
      }

      // Rebuild indexes
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'rebuilding',
        progress: 95,
        message: 'Rebuilding indexes…',
      })

      // Update or create project record
      const existing = database.getProject(backup.projectId)
      const now = new Date().toISOString()
      if (existing) {
        database.updateProject(backup.projectId, {
          path: finalTarget,
          lastOpened: now,
          agents: backup.agents.length ? backup.agents : existing.agents,
        })
      } else {
        database.upsertProject({
          id: backup.projectId,
          name: backup.projectName,
          path: finalTarget,
          framework: backup.framework,
          agents: backup.agents,
          chatCount: backup.chatCount,
          sizeBytes: backup.sizeBytes,
          lastOpened: now,
          lastBackup: backup.createdAt,
          protected: true,
          createdAt: now,
          updatedAt: now,
        })
      }

      database.addActivity({
        type: 'restore_complete',
        title: 'Restore complete',
        message: `${backup.projectName} restored to ${finalTarget}`,
        projectId: backup.projectId,
        projectName: backup.projectName,
        level: 'success',
      })

      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'complete',
        progress: 100,
        message: 'Restore complete',
      })

      this.toast(
        'success',
        'Project Restored',
        `${backup.projectName} files → ${finalTarget} · IDE history restored for: ${
          backup.agents?.length ? backup.agents.join(', ') : 'all tools in backup'
        }`
      )

      await fs.remove(workDir).catch(() => {})
      return restoreId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed'
      this.emit({
        restoreId,
        backupId,
        projectName: backup.projectName,
        stage: 'error',
        progress: 0,
        message,
      })
      database.addActivity({
        type: 'restore_failed',
        title: 'Restore failed',
        message: `${backup.projectName}: ${message}`,
        projectId: backup.projectId,
        projectName: backup.projectName,
        level: 'error',
      })
      this.toast('error', 'Restore Failed', message)
      await fs.remove(workDir).catch(() => {})
      throw err
    } finally {
      setTimeout(() => {
        if (this.current?.restoreId === restoreId) this.current = null
      }, 3000)
    }
  }

}

export const restoreEngine = new RestoreEngine()
