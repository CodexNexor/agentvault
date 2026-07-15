import path from 'node:path'
import fs from 'fs-extra'
import { v4 as uuid } from 'uuid'
import ignore from 'ignore'
import AdmZip from 'adm-zip'
import type { AgentId, BackupMeta, BackupProgress } from '../../shared/types.js'
import { database } from './database.js'
import { encryption } from './encryption.js'
import { getAppPaths, getComputerName, getPlatform } from './paths.js'
import { agentRegistry } from '../agents/registry.js'
import { dirSize, pathExists } from '../agents/utils.js'
import { googleDrive } from './google-drive.js'
import type { BrowserWindow } from 'electron'

export class BackupEngine {
  private current: BackupProgress | null = null
  private cancelled = false
  private mainWindow: BrowserWindow | null = null

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win
  }

  getProgress(): BackupProgress | null {
    return this.current
  }

  cancel(backupId: string): void {
    if (this.current?.backupId === backupId) {
      this.cancelled = true
    }
  }

  private emit(progress: BackupProgress): void {
    this.current = progress
    this.mainWindow?.webContents.send('backup:progress', progress)
  }

  private toast(type: string, title: string, message: string): void {
    this.mainWindow?.webContents.send('toast', { type, title, message })
  }

  async backupProject(
    projectId: string,
    selectedAgents?: AgentId[],
    options?: { complete?: boolean; forceCloud?: boolean }
  ): Promise<string> {
    const project = database.getProject(projectId)
    if (!project) throw new Error('Project not found')

    const complete = Boolean(options?.complete)
    const forceCloud = Boolean(options?.forceCloud || complete)

    // Complete backup = all linked IDEs; otherwise user selection or all linked
    const agentsToBackup: AgentId[] =
      complete && project.agents.length > 0
        ? [...project.agents]
        : selectedAgents && selectedAgents.length > 0
          ? [...selectedAgents]
          : project.agents.length > 0
            ? [...project.agents]
            : []

    if (agentsToBackup.length === 0) {
      throw new Error(
        'No AI tools linked to this project. Open it with Claude Code, Codex, etc. first.'
      )
    }

    const backupId = uuid()
    const settings = database.getSettings()
    this.cancelled = false

    const paths = getAppPaths()
    const workDir = path.join(paths.temp, backupId)
    const archivePath = path.join(workDir, 'archive.zip')
    const encryptedPath = path.join(paths.backups, `${backupId}.avault`)

    await fs.ensureDir(workDir)
    await fs.ensureDir(paths.backups)

    database.addActivity({
      type: 'backup_started',
      title: complete ? 'Complete backup started' : 'Backup started',
      message: complete
        ? `Full project + ${agentsToBackup.length} IDE(s) for ${project.name}`
        : `Backing up ${project.name}`,
      projectId: project.id,
      projectName: project.name,
      level: 'info',
    })

    try {
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'gathering',
        progress: 5,
        message: complete
          ? 'Gathering full project files + all IDE histories…'
          : 'Gathering project files and agent history…',
      })

      if (this.cancelled) throw new Error('Cancelled')

      // Collect project source (filtered)
      const staging = path.join(workDir, 'staging')
      await fs.ensureDir(staging)

      const meta = {
        version: 1,
        backupId,
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          framework: project.framework,
          agents: agentsToBackup,
        },
        selectedAgents: agentsToBackup,
        computerName: getComputerName(),
        platform: getPlatform(),
        createdAt: new Date().toISOString(),
        oldPaths: [project.path],
      }
      await fs.writeJson(path.join(staging, 'manifest.json'), meta, { spaces: 2 })

      // Copy project files with exclusions
      const projectDest = path.join(staging, 'workspace')
      await this.copyFiltered(
        project.path,
        projectDest,
        settings.excludePatterns,
        (p) => {
          this.emit({
            backupId,
            projectId: project.id,
            projectName: project.name,
            stage: 'gathering',
            progress: Math.min(40, 5 + p * 35),
            message: 'Copying project source…',
          })
        }
      )

      // Optional git metadata
      if (settings.includeGitMetadata) {
        const gitDir = path.join(project.path, '.git')
        if (await pathExists(gitDir)) {
          // Only config, HEAD, refs — not full objects
          for (const part of ['config', 'HEAD', 'refs', 'packed-refs', 'description']) {
            const src = path.join(gitDir, part)
            if (await pathExists(src)) {
              await fs.copy(src, path.join(projectDest, '.git', part), { overwrite: true })
            }
          }
        }
      }

      // Agent artifacts
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'gathering',
        progress: 45,
        message: 'Collecting AI agent history…',
      })

      for (const provider of agentRegistry.all()) {
        // Only include explicitly selected IDEs
        if (!agentsToBackup.includes(provider.id)) continue
        try {
          const artifacts = await provider.backup({
            project,
            workspacePath: project.path,
            tempDir: workDir,
            excludePatterns: settings.excludePatterns,
          })
          for (const art of artifacts) {
            const dest = path.join(staging, art.relativePath)
            await fs.ensureDir(path.dirname(dest))
            if (art.kind === 'inline' && art.content !== undefined) {
              await fs.writeFile(dest, art.content)
            } else if (art.kind === 'dir') {
              if (await pathExists(art.sourcePath)) {
                await fs.copy(art.sourcePath, dest, { overwrite: true })
              }
            } else if (await pathExists(art.sourcePath)) {
              await fs.copy(art.sourcePath, dest, { overwrite: true })
            }
          }
        } catch (err) {
          console.warn(`[Backup] Agent ${provider.id} backup partial:`, err)
        }
      }

      if (this.cancelled) throw new Error('Cancelled')

      // Compress
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'compressing',
        progress: 55,
        message: 'Compressing archive…',
      })

      const sizeBytes = await dirSize(staging)
      await this.createZip(staging, archivePath)

      const compressedBytes = (await fs.stat(archivePath)).size
      const compressionRatio =
        sizeBytes > 0 ? Math.round((compressedBytes / sizeBytes) * 1000) / 1000 : 1

      if (this.cancelled) throw new Error('Cancelled')

      // Package as plain .avault (ZIP) — no encryption keys / passwords
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'encrypting',
        progress: 75,
        message: 'Packaging archive…',
      })

      // .avault = plain zip for easy Drive recovery after PC reset
      const finalPath = encryptedPath
      await fs.move(archivePath, finalPath, { overwrite: true })
      const checksum = await encryption.checksumFile(finalPath)
      const encrypted = false

      // Upload to cloud if connected (Complete Backup always tries Drive)
      let cloudPath: string | null = null
      let location: BackupMeta['location'] = 'local'
      const shouldUpload =
        forceCloud ||
        (settings.googleConnected && settings.cloudProvider === 'google-drive')

      if (shouldUpload) {
        this.emit({
          backupId,
          projectId: project.id,
          projectName: project.name,
          stage: 'uploading',
          progress: 85,
          message: forceCloud
            ? 'Uploading complete backup to Google Drive…'
            : 'Uploading to Google Drive…',
        })
        try {
          if (!settings.googleConnected && forceCloud) {
            database.updateSettings({
              googleConnected: true,
              cloudProvider: 'google-drive',
            })
          }

          cloudPath = await googleDrive.uploadBackup(
            finalPath,
            project.name,
            backupId,
            path.basename(finalPath),
            {
              projectId: project.id,
              projectPath: project.path,
              agents: agentsToBackup,
              chatCount: project.chatCount,
              sizeBytes,
              compressedBytes,
              framework: project.framework,
              createdAt: new Date().toISOString(),
              computerName: getComputerName(),
            }
          )
          location = 'both'
          database.addActivity({
            type: 'upload_complete',
            title: 'Upload complete',
            message: `${project.name} complete backup is on Google Drive`,
            projectId: project.id,
            projectName: project.name,
            level: 'success',
          })
          this.toast(
            'success',
            'Saved to Google Drive',
            `${project.name} · full project + IDE history (ready after PC reset)`
          )
        } catch (err) {
          console.error('[Backup] Cloud upload failed:', err)
          database.addActivity({
            type: 'error',
            title: 'Cloud upload failed',
            message: err instanceof Error ? err.message : 'Upload failed',
            projectId: project.id,
            projectName: project.name,
            level: 'warning',
          })
          if (forceCloud) {
            this.toast(
              'error',
              'Local backup OK, Drive upload failed',
              err instanceof Error ? err.message : 'Upload failed'
            )
          }
        }
      }

      // Verify
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'verifying',
        progress: 95,
        message: 'Verifying integrity…',
      })

      const verifyChecksum = await encryption.checksumFile(finalPath)
      if (verifyChecksum !== checksum) {
        throw new Error('Checksum verification failed')
      }

      const backup: BackupMeta = {
        id: backupId,
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        agents: agentsToBackup,
        chatCount: project.chatCount,
        sizeBytes,
        compressedBytes,
        checksum,
        encrypted,
        location,
        cloudPath,
        localPath: finalPath,
        computerName: getComputerName(),
        platform: getPlatform(),
        createdAt: new Date().toISOString(),
        framework: project.framework,
        compressionRatio,
        incremental: false,
        parentBackupId: null,
      }

      database.insertBackup(backup)
      database.updateProject(project.id, { lastBackup: backup.createdAt })

      database.addActivity({
        type: 'backup_complete',
        title: complete ? 'Complete backup ready' : 'Backup complete',
        message: `${project.name} · ${formatBytes(compressedBytes)} · ${agentsToBackup.join(', ')}${location === 'both' ? ' · Drive' : ''}`,
        projectId: project.id,
        projectName: project.name,
        level: 'success',
        metadata: { backupId, compressionRatio, complete, location },
      })

      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'complete',
        progress: 100,
        message: complete ? 'Complete backup finished' : 'Backup complete',
      })

      this.toast(
        'success',
        complete ? 'Complete Backup Done' : 'Backup Complete',
        location === 'both'
          ? `${project.name} · project files + IDE history on this PC and Drive`
          : `${project.name} · project files + IDE history saved locally`
      )

      // Cleanup temp
      await fs.remove(workDir).catch(() => {})

      return backupId
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Backup failed'
      this.emit({
        backupId,
        projectId: project.id,
        projectName: project.name,
        stage: 'error',
        progress: 0,
        message,
      })
      database.addActivity({
        type: 'backup_failed',
        title: 'Backup failed',
        message: `${project.name}: ${message}`,
        projectId: project.id,
        projectName: project.name,
        level: 'error',
      })
      this.toast('error', 'Backup Failed', message)
      await fs.remove(workDir).catch(() => {})
      throw err
    } finally {
      setTimeout(() => {
        if (this.current?.backupId === backupId) this.current = null
      }, 3000)
    }
  }

  /** Full project source + every linked IDE history, forced cloud upload */
  async completeBackup(projectId: string): Promise<string> {
    return this.backupProject(projectId, undefined, {
      complete: true,
      forceCloud: true,
    })
  }

  private async copyFiltered(
    src: string,
    dest: string,
    excludePatterns: string[],
    onProgress?: (ratio: number) => void
  ): Promise<void> {
    const ig = ignore().add(excludePatterns)
    await fs.ensureDir(dest)

    const files: string[] = []
    async function collect(dir: string, rel = '') {
      let entries
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const relPath = rel ? `${rel}/${e.name}` : e.name
        if (ig.ignores(relPath) || ig.ignores(relPath + '/')) continue
        if (e.name === 'node_modules' || e.name === '.git') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          await collect(full, relPath)
        } else {
          files.push(relPath)
        }
      }
    }
    await collect(src)

    let i = 0
    for (const rel of files) {
      const from = path.join(src, rel)
      const to = path.join(dest, rel)
      await fs.ensureDir(path.dirname(to))
      try {
        await fs.copy(from, to)
      } catch {
        /* skip unreadable */
      }
      i++
      if (i % 50 === 0) onProgress?.(i / Math.max(files.length, 1))
    }
    onProgress?.(1)
  }

  private async createZip(sourceDir: string, outPath: string): Promise<void> {
    // adm-zip is pure JS and works reliably under Electron CJS bundles
    const zip = new AdmZip()
    zip.addLocalFolder(sourceDir)
    zip.writeZip(outPath)
  }

  async verifyBackup(backupId: string) {
    const backup = database.getBackup(backupId)
    if (!backup || !backup.localPath) {
      return {
        backupId,
        valid: false,
        checksumMatch: false,
        encrypted: false,
        errors: ['Backup not found locally'],
      }
    }
    const errors: string[] = []
    try {
      const checksum = await encryption.checksumFile(backup.localPath)
      const match = checksum === backup.checksum
      if (!match) errors.push('Checksum mismatch')
      return {
        backupId,
        valid: match,
        checksumMatch: match,
        encrypted: backup.encrypted,
        errors,
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Verification failed')
      return {
        backupId,
        valid: false,
        checksumMatch: false,
        encrypted: backup.encrypted,
        errors,
      }
    }
  }

  async exportBackup(backupId: string, destPath: string): Promise<void> {
    const backup = database.getBackup(backupId)
    if (!backup?.localPath) throw new Error('Backup not found')
    await fs.copy(backup.localPath, destPath)
  }

  async importBackup(filePath: string): Promise<BackupMeta> {
    const paths = getAppPaths()
    const backupId = uuid()
    const dest = path.join(paths.backups, `${backupId}${path.extname(filePath) || '.avault'}`)
    await fs.copy(filePath, dest)
    const checksum = await encryption.checksumFile(dest)
    const stat = await fs.stat(dest)

    const projectName = path.basename(filePath, path.extname(filePath)) || 'Imported Backup'
    const projectId = uuid()
    const agents: BackupMeta['agents'] = []
    const framework: string | null = null
    const chatCount = 0

    if (await encryption.looksLikeLegacyEncrypted(dest)) {
      throw new Error(
        'This file uses the old encryption format. Run Complete Backup again with the new app (plain archives).'
      )
    }

    const backup: BackupMeta = {
      id: backupId,
      projectId,
      projectName,
      projectPath: null,
      agents,
      chatCount,
      sizeBytes: stat.size,
      compressedBytes: stat.size,
      checksum,
      encrypted: false,
      location: 'local',
      cloudPath: null,
      localPath: dest,
      computerName: getComputerName(),
      platform: getPlatform(),
      createdAt: new Date().toISOString(),
      framework,
      compressionRatio: 1,
      incremental: false,
      parentBackupId: null,
    }

    // Ensure a project stub exists
    if (!database.getProject(projectId)) {
      database.upsertProject({
        id: projectId,
        name: projectName,
        path: path.join(getAppPaths().imports, projectName),
        framework,
        agents,
        chatCount,
        sizeBytes: stat.size,
        lastOpened: null,
        lastBackup: backup.createdAt,
        protected: true,
        createdAt: backup.createdAt,
        updatedAt: backup.createdAt,
      })
    }

    database.insertBackup(backup)
    database.addActivity({
      type: 'info',
      title: 'Backup imported',
      message: `Imported backup (${formatBytes(stat.size)})`,
      level: 'success',
    })
    this.toast('success', 'Backup Imported', 'Encrypted backup is ready to restore.')
    return backup
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const backupEngine = new BackupEngine()
