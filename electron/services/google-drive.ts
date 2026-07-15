import path from 'node:path'
import fs from 'fs-extra'
import { google, type drive_v3 } from 'googleapis'
import { shell } from 'electron'
import http from 'node:http'
import { URL } from 'node:url'
import type {
  AgentId,
  CloudBackupEntry,
  GoogleAuthState,
} from '../../shared/types.js'
import { getAppPaths } from './paths.js'
import { database } from './database.js'
import { v4 as uuid } from 'uuid'
import { GOOGLE_OAUTH } from '../config/oauth.js'

/**
 * Google Drive integration.
 *
 * Built-in OAuth client is shipped with the app so users only click
 * "Connect Google Drive". Env vars can still override for development.
 * Backups are plain .avault ZIP archives — no encryption keys.
 */

const SCOPES = [...GOOGLE_OAUTH.scopes]
const REDIRECT_PORT = 42813
const REDIRECT_URI = GOOGLE_OAUTH.redirectUri

const FOLDER_NAME = 'AgentVault'
const SUBFOLDERS = ['Projects', 'Backups', 'Metadata'] as const

interface TokenStore {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  email?: string
  name?: string
  picture?: string
}

interface FolderMap {
  root: string
  Projects: string
  Backups: string
  Metadata: string
}

export class GoogleDriveService {
  private oauth2: InstanceType<typeof google.auth.OAuth2> | null = null
  private drive: drive_v3.Drive | null = null
  private folders: FolderMap | null = null
  private demoMode = false
  private demoConnected = false

  /**
   * Priority: user BYO credentials → env → built-in app credentials
   * BYO avoids the shared app 100-user / verification limits.
   */
  private getClientId(): string | null {
    const user = database.getSettings().googleClientId?.trim()
    if (user) return user
    return (
      process.env.AGENTVAULT_GOOGLE_CLIENT_ID ||
      process.env.GOOGLE_CLIENT_ID ||
      GOOGLE_OAUTH.clientId ||
      null
    )
  }

  private getClientSecret(): string | null {
    const user = database.getSettings().googleClientSecret?.trim()
    if (user) return user
    return (
      process.env.AGENTVAULT_GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET ||
      GOOGLE_OAUTH.clientSecret ||
      null
    )
  }

  private usingUserCredentials(): boolean {
    const s = database.getSettings()
    return Boolean(s.googleClientId?.trim() && s.googleClientSecret?.trim())
  }

  /** Call after user pastes Client ID + Secret so Connect uses them immediately */
  reconfigureOAuth(): void {
    const clientId = this.getClientId()
    const clientSecret = this.getClientSecret()
    if (!clientId || !clientSecret) {
      this.demoMode = true
      this.oauth2 = null
      this.drive = null
      return
    }
    this.oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
    this.demoMode = false
    this.folders = null
  }

  async saveUserCredentials(
    clientId: string,
    clientSecret: string
  ): Promise<void> {
    const id = clientId.trim()
    const secret = clientSecret.trim()
    if (!id || !secret) {
      throw new Error('Both Client ID and Client secret are required')
    }
    if (!id.includes('.apps.googleusercontent.com')) {
      throw new Error(
        'Client ID looks invalid — it should end with .apps.googleusercontent.com'
      )
    }
    database.updateSettings({
      googleClientId: id,
      googleClientSecret: secret,
    })
    // Drop old tokens from a different OAuth client
    await fs.remove(this.tokensPath()).catch(() => {})
    await fs.remove(this.foldersPath()).catch(() => {})
    this.drive = null
    this.folders = null
    this.reconfigureOAuth()
    database.addActivity({
      type: 'info',
      title: 'Google OAuth credentials saved',
      message: 'Your Desktop Client ID is stored on this PC only. Click Connect Google Drive next.',
      level: 'success',
    })
  }

  async clearUserCredentials(): Promise<void> {
    database.updateSettings({
      googleClientId: null,
      googleClientSecret: null,
      googleConnected: false,
      googleEmail: null,
      cloudProvider: 'none',
    })
    await fs.remove(this.tokensPath()).catch(() => {})
    await fs.remove(this.foldersPath()).catch(() => {})
    this.drive = null
    this.folders = null
    this.demoConnected = false
    this.reconfigureOAuth()
  }

  private tokensPath(): string {
    return path.join(getAppPaths().keys, 'google-tokens.json')
  }

  private foldersPath(): string {
    return path.join(getAppPaths().keys, 'google-folders.json')
  }

  async initialize(): Promise<void> {
    this.reconfigureOAuth()

    if (this.demoMode || !this.oauth2) {
      this.demoConnected = false
      return
    }

    if (await fs.pathExists(this.tokensPath())) {
      try {
        const tokens = (await fs.readJson(this.tokensPath())) as TokenStore
        this.oauth2.setCredentials(tokens)
        this.drive = google.drive({ version: 'v3', auth: this.oauth2 })
        if (await fs.pathExists(this.foldersPath())) {
          this.folders = await fs.readJson(this.foldersPath())
        }
      } catch {
        /* re-auth needed */
      }
    }
  }

  getAuthState(): GoogleAuthState {
    const s = database.getSettings()
    if (this.drive && this.oauth2 && s.googleConnected) {
      return {
        connected: true,
        email: s.googleEmail,
        name: null,
        picture: null,
      }
    }
    // Tokens on disk count as connected after restart
    if (this.drive && this.oauth2) {
      return {
        connected: true,
        email: s.googleEmail,
        name: null,
        picture: null,
      }
    }
    return { connected: false, email: null, name: null, picture: null }
  }

  async connect(): Promise<GoogleAuthState> {
    // Always rebuild client so BYO credentials are used if just saved
    this.reconfigureOAuth()

    if (this.demoMode || !this.oauth2) {
      // No credentials at all — soft demo only if nothing configured
      if (!this.getClientId() || !this.getClientSecret()) {
        throw new Error(
          'Add your Google Desktop Client ID and Client secret in Settings → Google Drive first.'
        )
      }
      throw new Error('OAuth client failed to start. Check Client ID and secret.')
    }

    const authUrl = this.oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    })

    const code = await this.waitForOAuthCode(authUrl)
    const { tokens } = await this.oauth2.getToken(code)
    this.oauth2.setCredentials(tokens)
    await fs.writeJson(this.tokensPath(), tokens, { spaces: 2 })

    this.drive = google.drive({ version: 'v3', auth: this.oauth2 })
    this.demoMode = false
    this.demoConnected = false

    // Fetch user email via about or people — Drive about
    let email: string | null = null
    try {
      const about = await this.drive.about.get({ fields: 'user' })
      email = about.data.user?.emailAddress || null
    } catch {
      /* optional */
    }

    await this.ensureFolderStructure()

    database.updateSettings({
      googleConnected: true,
      googleEmail: email,
      cloudProvider: 'google-drive',
    })
    database.addActivity({
      type: 'drive_connected',
      title: 'Google Drive connected',
      message: email ? `Signed in as ${email}` : 'Google Drive ready',
      level: 'success',
    })

    return {
      connected: true,
      email,
      name: null,
      picture: null,
    }
  }

  async disconnect(): Promise<void> {
    this.demoConnected = false
    this.drive = null
    this.folders = null
    if (this.oauth2) this.oauth2.setCredentials({})
    await fs.remove(this.tokensPath()).catch(() => {})
    await fs.remove(this.foldersPath()).catch(() => {})
    database.updateSettings({
      googleConnected: false,
      googleEmail: null,
      cloudProvider: database.getSettings().offlineMode ? 'local' : 'none',
    })
    database.addActivity({
      type: 'drive_disconnected',
      title: 'Google Drive disconnected',
      message: 'Cloud sync disabled',
      level: 'info',
    })
  }

  private waitForOAuthCode(authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        try {
          const url = new URL(req.url || '', `http://127.0.0.1:${REDIRECT_PORT}`)
          if (url.pathname !== '/oauth2callback') {
            res.writeHead(404)
            res.end()
            return
          }
          const code = url.searchParams.get('code')
          const error = url.searchParams.get('error')
          res.writeHead(200, { 'Content-Type': 'text/html' })
          if (error || !code) {
            res.end('<html><body><h1>Authentication failed</h1><p>You can close this window.</p></body></html>')
            server.close()
            reject(new Error(error || 'No code'))
            return
          }
          res.end(
            '<html><body style="font-family:system-ui;background:#090909;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh"><div><h1>Connected to AgentVault</h1><p>You can close this window.</p></div></body></html>'
          )
          server.close()
          resolve(code)
        } catch (err) {
          server.close()
          reject(err)
        }
      })

      server.listen(REDIRECT_PORT, '127.0.0.1', () => {
        shell.openExternal(authUrl)
      })

      server.on('error', reject)
      setTimeout(() => {
        server.close()
        reject(new Error('OAuth timeout'))
      }, 5 * 60 * 1000)
    })
  }

  private async ensureFolderStructure(): Promise<FolderMap> {
    if (!this.drive) throw new Error('Drive not connected')

    if (this.folders) return this.folders

    const rootId = await this.findOrCreateFolder(FOLDER_NAME, 'root')
    const map: FolderMap = {
      root: rootId,
      Projects: await this.findOrCreateFolder('Projects', rootId),
      Backups: await this.findOrCreateFolder('Backups', rootId),
      Metadata: await this.findOrCreateFolder('Metadata', rootId),
    }
    this.folders = map
    await fs.writeJson(this.foldersPath(), map, { spaces: 2 })
    return map
  }

  private async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    if (!this.drive) throw new Error('Drive not connected')

    const q =
      parentId === 'root'
        ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`
        : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`

    const res = await this.drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive',
    })

    if (res.data.files && res.data.files.length > 0 && res.data.files[0].id) {
      return res.data.files[0].id
    }

    const created = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId === 'root' ? undefined : [parentId],
      },
      fields: 'id',
    })

    if (!created.data.id) throw new Error(`Failed to create folder ${name}`)
    return created.data.id
  }

  async uploadBackup(
    localPath: string,
    projectName: string,
    backupId: string,
    fileName: string,
    metaExtra?: Partial<CloudBackupEntry>
  ): Promise<string> {
    const catalogMeta: CloudBackupEntry = {
      backupId,
      projectId: metaExtra?.projectId || backupId,
      projectName,
      projectPath: metaExtra?.projectPath ?? null,
      agents: metaExtra?.agents || [],
      chatCount: metaExtra?.chatCount || 0,
      sizeBytes: metaExtra?.sizeBytes || 0,
      compressedBytes: metaExtra?.compressedBytes || 0,
      framework: metaExtra?.framework ?? null,
      createdAt: metaExtra?.createdAt || new Date().toISOString(),
      computerName: metaExtra?.computerName || '',
      driveFileId: '',
      metadataFileId: null,
      source: 'cloud',
      format: 'plain-zip',
      encrypted: false,
    }

    if (this.demoMode) {
      // Persist a local cloud catalog so Scan Drive works offline/demo
      const catalogPath = path.join(getAppPaths().keys, 'demo-cloud-catalog.json')
      let catalog: CloudBackupEntry[] = []
      if (await fs.pathExists(catalogPath)) {
        catalog = await fs.readJson(catalogPath)
      }
      const demoId = `demo-${backupId}`
      // Copy archive into cache as "cloud" object
      const cloudCopy = path.join(getAppPaths().cache, 'demo-cloud', `${backupId}.avault`)
      await fs.ensureDir(path.dirname(cloudCopy))
      await fs.copy(localPath, cloudCopy)
      catalogMeta.driveFileId = demoId
      catalog = catalog.filter((c) => c.backupId !== backupId)
      catalog.unshift(catalogMeta)
      await fs.writeJson(catalogPath, catalog, { spaces: 2 })
      return demoId
    }

    if (!this.drive) throw new Error('Google Drive not connected')
    const folders = await this.ensureFolderStructure()

    // Project subfolder under Backups
    const projectFolderId = await this.findOrCreateFolder(
      projectName.replace(/[^\w\- .]/g, '_'),
      folders.Backups
    )

    const res = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [projectFolderId],
        description: `AgentVault complete backup ${backupId}`,
      },
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(localPath),
      },
      fields: 'id',
    })

    if (!res.data.id) throw new Error('Upload failed')
    catalogMeta.driveFileId = res.data.id

    // Write rich metadata sidecar for Scan Drive on a fresh PC
    try {
      const metaBody = {
        ...catalogMeta,
        fileName,
        version: 2,
        kind: 'agentvault-backup',
        format: 'plain-zip',
        encrypted: false,
        uploadedAt: new Date().toISOString(),
      }
      const metaRes = await this.drive.files.create({
        requestBody: {
          name: `${backupId}.json`,
          parents: [folders.Metadata],
          mimeType: 'application/json',
        },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify(metaBody, null, 2),
        },
        fields: 'id',
      })
      catalogMeta.metadataFileId = metaRes.data.id || null
    } catch {
      /* non-fatal */
    }

    return res.data.id
  }

  async downloadBackup(cloudPathOrId: string, destPath: string): Promise<void> {
    if (this.demoMode) {
      // Resolve demo catalog copy
      if (cloudPathOrId.startsWith('demo-')) {
        const backupId = cloudPathOrId.replace(/^demo-/, '')
        const cloudCopy = path.join(getAppPaths().cache, 'demo-cloud', `${backupId}.avault`)
        if (!(await fs.pathExists(cloudCopy))) {
          // try with full id
          const alt = path.join(
            getAppPaths().cache,
            'demo-cloud',
            `${cloudPathOrId.replace(/^demo-/, '')}.avault`
          )
          if (await fs.pathExists(alt)) {
            await fs.copy(alt, destPath)
            return
          }
          // search catalog
          const catalogPath = path.join(getAppPaths().keys, 'demo-cloud-catalog.json')
          if (await fs.pathExists(catalogPath)) {
            const catalog = (await fs.readJson(catalogPath)) as CloudBackupEntry[]
            const hit = catalog.find(
              (c) => c.driveFileId === cloudPathOrId || c.backupId === backupId
            )
            if (hit) {
              const p = path.join(getAppPaths().cache, 'demo-cloud', `${hit.backupId}.avault`)
              if (await fs.pathExists(p)) {
                await fs.copy(p, destPath)
                return
              }
            }
          }
          throw new Error('Demo cloud file missing — re-run Complete Backup with Drive connected.')
        }
        await fs.copy(cloudCopy, destPath)
        return
      }
      throw new Error('Demo mode: unknown cloud file id')
    }
    if (!this.drive) throw new Error('Google Drive not connected')

    await fs.ensureDir(path.dirname(destPath))
    const dest = fs.createWriteStream(destPath)
    const res = await this.drive.files.get(
      { fileId: cloudPathOrId, alt: 'media' },
      { responseType: 'stream' }
    )

    await new Promise<void>((resolve, reject) => {
      ;(res.data as NodeJS.ReadableStream)
        .on('error', reject)
        .pipe(dest)
        .on('finish', () => resolve())
        .on('error', reject)
    })
  }

  /**
   * True if Drive file starts with ZIP magic (PK). False for old AES JSON .avault.
   */
  private async isPlainZipOnDrive(fileId: string): Promise<boolean> {
    if (!this.drive) return false
    if (fileId.startsWith('demo-')) {
      const backupId = fileId.replace(/^demo-/, '')
      const p = path.join(getAppPaths().cache, 'demo-cloud', `${backupId}.avault`)
      if (!(await fs.pathExists(p))) return false
      const fd = await fs.open(p, 'r')
      try {
        const buf = Buffer.alloc(4)
        await fs.read(fd, buf, 0, 4, 0)
        return buf[0] === 0x50 && buf[1] === 0x4b
      } finally {
        await fs.close(fd)
      }
    }
    try {
      const res = await this.drive.files.get(
        { fileId, alt: 'media' },
        {
          responseType: 'arraybuffer',
          headers: { Range: 'bytes=0-3' },
        }
      )
      const data = res.data as ArrayBuffer | string | Buffer
      const buf = Buffer.isBuffer(data)
        ? data
        : typeof data === 'string'
          ? Buffer.from(data)
          : Buffer.from(data)
      // ZIP local file header
      return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b
    } catch {
      return false
    }
  }

  private async trashDriveFile(fileId: string | null | undefined): Promise<void> {
    if (!fileId || !this.drive || fileId.startsWith('demo-')) return
    try {
      await this.drive.files.update({
        fileId,
        requestBody: { trashed: true },
      })
    } catch (err) {
      console.warn('[Drive] trash failed', fileId, err)
    }
  }

  /**
   * Remove old AES-encrypted backups + vault-escrow from Drive.
   * Only plain-zip archives remain listed/restorable.
   */
  async purgeLegacyCloudBackups(): Promise<{ deleted: number; kept: number }> {
    if (this.demoMode) {
      const catalogPath = path.join(getAppPaths().keys, 'demo-cloud-catalog.json')
      let catalog: CloudBackupEntry[] = []
      if (await fs.pathExists(catalogPath)) {
        catalog = await fs.readJson(catalogPath)
      }
      const kept: CloudBackupEntry[] = []
      let deleted = 0
      for (const c of catalog) {
        const ok =
          c.format === 'plain-zip' ||
          c.encrypted === false ||
          (c.driveFileId && (await this.isPlainZipOnDrive(c.driveFileId)))
        if (ok) {
          kept.push({ ...c, format: 'plain-zip', encrypted: false })
        } else {
          deleted++
          const p = path.join(
            getAppPaths().cache,
            'demo-cloud',
            `${c.backupId}.avault`
          )
          await fs.remove(p).catch(() => {})
        }
      }
      await fs.writeJson(catalogPath, kept, { spaces: 2 })
      await fs.remove(path.join(getAppPaths().keys, 'demo-vault-escrow.json')).catch(() => {})
      return { deleted, kept: kept.length }
    }

    if (!this.drive) throw new Error('Connect Google Drive first')
    const folders = await this.ensureFolderStructure()

    // Trash vault-escrow key files (no longer used)
    try {
      const escrowList = await this.drive.files.list({
        q: `'${folders.Metadata}' in parents and name='vault-escrow.json' and trashed=false`,
        fields: 'files(id)',
        pageSize: 10,
      })
      for (const f of escrowList.data.files || []) {
        await this.trashDriveFile(f.id)
      }
    } catch {
      /* optional */
    }

    const metaList = await this.drive.files.list({
      q: `'${folders.Metadata}' in parents and trashed=false and mimeType='application/json'`,
      fields: 'files(id, name)',
      pageSize: 200,
      spaces: 'drive',
    })

    let deleted = 0
    let kept = 0

    for (const f of metaList.data.files || []) {
      if (!f.id || f.name === 'vault-escrow.json') {
        if (f.id) {
          await this.trashDriveFile(f.id)
          deleted++
        }
        continue
      }
      try {
        const res = await this.drive.files.get(
          { fileId: f.id, alt: 'media' },
          { responseType: 'text' as unknown as 'json' }
        )
        const raw =
          typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const meta = JSON.parse(raw) as Partial<CloudBackupEntry> & {
          kind?: string
          driveFileId?: string
        }
        if (meta.kind === 'agentvault-vault-escrow') {
          await this.trashDriveFile(f.id)
          deleted++
          continue
        }
        if (!meta.backupId || !meta.projectName) {
          await this.trashDriveFile(f.id)
          deleted++
          continue
        }

        const markedPlain =
          meta.format === 'plain-zip' || meta.encrypted === false
        let isPlain = markedPlain
        if (!isPlain && meta.driveFileId) {
          isPlain = await this.isPlainZipOnDrive(meta.driveFileId)
        }
        // Unmarked old encrypted JSON avaults
        if (!isPlain && meta.encrypted === true) {
          isPlain = false
        }
        if (!isPlain && !meta.driveFileId) {
          // no archive id — junk meta
          await this.trashDriveFile(f.id)
          deleted++
          continue
        }
        if (!isPlain) {
          await this.trashDriveFile(meta.driveFileId)
          await this.trashDriveFile(f.id)
          deleted++
          continue
        }
        kept++
      } catch (err) {
        console.warn('[Drive] purge skip', f.name, err)
      }
    }

    // Also walk Backups/** for orphan .avault that are not ZIP
    try {
      const projectFolders = await this.drive.files.list({
        q: `'${folders.Backups}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 100,
      })
      for (const folder of projectFolders.data.files || []) {
        if (!folder.id) continue
        const files = await this.drive.files.list({
          q: `'${folder.id}' in parents and trashed=false`,
          fields: 'files(id, name)',
          pageSize: 50,
        })
        for (const file of files.data.files || []) {
          if (!file.id || !file.name) continue
          if (!/\.avault$/i.test(file.name) && !/\.zip$/i.test(file.name)) continue
          const plain = await this.isPlainZipOnDrive(file.id)
          if (!plain) {
            await this.trashDriveFile(file.id)
            deleted++
          }
        }
      }
    } catch (err) {
      console.warn('[Drive] orphan purge', err)
    }

    database.addActivity({
      type: 'info',
      title: 'Removed old encrypted cloud backups',
      message: `Deleted ${deleted} legacy item(s); kept ${kept} plain ZIP backup(s)`,
      level: 'success',
    })

    return { deleted, kept }
  }

  /**
   * Scan Drive for project backups — **plain ZIP only**.
   * Old encrypted backups are purged (trashed) and never shown.
   */
  async scanDrive(): Promise<CloudBackupEntry[]> {
    // Always clean legacy encrypted archives first so Cloud Projects stays clean
    try {
      await this.purgeLegacyCloudBackups()
    } catch (err) {
      console.warn('[Drive] legacy purge during scan:', err)
    }

    if (this.demoMode) {
      const catalogPath = path.join(getAppPaths().keys, 'demo-cloud-catalog.json')
      let catalog: CloudBackupEntry[] = []
      if (await fs.pathExists(catalogPath)) {
        catalog = await fs.readJson(catalogPath)
      }
      // Only plain-zip local backups
      const local = database.getBackups()
      for (const b of local) {
        if (b.encrypted) continue
        if (!catalog.find((c) => c.backupId === b.id)) {
          if (b.localPath && (await fs.pathExists(b.localPath))) {
            const cloudCopy = path.join(getAppPaths().cache, 'demo-cloud', `${b.id}.avault`)
            await fs.ensureDir(path.dirname(cloudCopy))
            if (!(await fs.pathExists(cloudCopy))) {
              await fs.copy(b.localPath, cloudCopy)
            }
            // Skip if not ZIP
            if (!(await this.isPlainZipOnDrive(`demo-${b.id}`))) continue
            catalog.push({
              backupId: b.id,
              projectId: b.projectId,
              projectName: b.projectName,
              projectPath: b.projectPath,
              agents: b.agents,
              chatCount: b.chatCount,
              sizeBytes: b.sizeBytes,
              compressedBytes: b.compressedBytes,
              framework: b.framework,
              createdAt: b.createdAt,
              computerName: b.computerName,
              driveFileId: b.cloudPath || `demo-${b.id}`,
              metadataFileId: null,
              source: b.location === 'local' ? 'local' : 'both',
              format: 'plain-zip',
              encrypted: false,
            })
          }
        }
      }
      catalog = catalog.filter(
        (c) => c.format === 'plain-zip' || c.encrypted === false
      )
      await fs.writeJson(catalogPath, catalog, { spaces: 2 })
      database.addActivity({
        type: 'info',
        title: 'Drive scan complete',
        message: `Found ${catalog.length} plain ZIP cloud backup(s)`,
        level: 'success',
      })
      return catalog.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    }

    if (!this.drive) throw new Error('Connect Google Drive first')
    const folders = await this.ensureFolderStructure()

    const metaList = await this.drive.files.list({
      q: `'${folders.Metadata}' in parents and trashed=false and mimeType='application/json'`,
      fields: 'files(id, name, createdTime, modifiedTime)',
      pageSize: 200,
      spaces: 'drive',
    })

    const entries: CloudBackupEntry[] = []
    for (const f of metaList.data.files || []) {
      if (!f.id || f.name === 'vault-escrow.json') continue
      try {
        const res = await this.drive.files.get(
          { fileId: f.id, alt: 'media' },
          { responseType: 'text' as unknown as 'json' }
        )
        const raw =
          typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const meta = JSON.parse(raw) as Partial<CloudBackupEntry> & {
          driveFileId?: string
          backupId?: string
          projectName?: string
          kind?: string
        }
        if (meta.kind === 'agentvault-vault-escrow') continue
        if (!meta.backupId || !meta.projectName) continue

        // Only list plain ZIP backups
        const markedPlain =
          meta.format === 'plain-zip' || meta.encrypted === false
        let isPlain = markedPlain
        if (!isPlain && meta.driveFileId) {
          isPlain = await this.isPlainZipOnDrive(meta.driveFileId)
        }
        if (!isPlain) continue

        entries.push({
          backupId: meta.backupId,
          projectId: meta.projectId || meta.backupId,
          projectName: meta.projectName,
          projectPath: meta.projectPath ?? null,
          agents: (meta.agents as AgentId[]) || [],
          chatCount: meta.chatCount || 0,
          sizeBytes: meta.sizeBytes || 0,
          compressedBytes: meta.compressedBytes || 0,
          framework: meta.framework ?? null,
          createdAt: meta.createdAt || f.createdTime || new Date().toISOString(),
          computerName: meta.computerName || '',
          driveFileId: meta.driveFileId || '',
          metadataFileId: f.id,
          source: 'cloud',
          format: 'plain-zip',
          encrypted: false,
        })
      } catch (err) {
        console.warn('[Drive] skip meta', f.name, err)
      }
    }

    // Fallback: list plain .avault under project folders if metadata empty
    if (entries.length === 0) {
      const projectFolders = await this.drive.files.list({
        q: `'${folders.Backups}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, createdTime, size)',
        pageSize: 100,
      })
      for (const folder of projectFolders.data.files || []) {
        if (!folder.id) continue
        if (
          folder.mimeType === 'application/vnd.google-apps.folder'
        ) {
          const kids = await this.drive.files.list({
            q: `'${folder.id}' in parents and trashed=false`,
            fields: 'files(id, name, createdTime, size)',
            pageSize: 50,
          })
          for (const file of kids.data.files || []) {
            if (!file.id || !file.name?.match(/\.avault$|\.zip$/i)) continue
            if (!(await this.isPlainZipOnDrive(file.id))) continue
            const id = path.basename(file.name, path.extname(file.name))
            entries.push({
              backupId: id,
              projectId: id,
              projectName: folder.name || file.name.replace(/\.avault$|\.zip$/i, ''),
              projectPath: null,
              agents: [],
              chatCount: 0,
              sizeBytes: Number(file.size) || 0,
              compressedBytes: Number(file.size) || 0,
              framework: null,
              createdAt: file.createdTime || new Date().toISOString(),
              computerName: '',
              driveFileId: file.id,
              metadataFileId: null,
              source: 'cloud',
              format: 'plain-zip',
              encrypted: false,
            })
          }
        } else if (folder.name?.match(/\.avault$|\.zip$/i)) {
          if (!(await this.isPlainZipOnDrive(folder.id))) continue
          const id = path.basename(folder.name, path.extname(folder.name))
          entries.push({
            backupId: id,
            projectId: id,
            projectName: folder.name.replace(/\.avault$|\.zip$/i, ''),
            projectPath: null,
            agents: [],
            chatCount: 0,
            sizeBytes: Number(folder.size) || 0,
            compressedBytes: Number(folder.size) || 0,
            framework: null,
            createdAt: folder.createdTime || new Date().toISOString(),
            computerName: '',
            driveFileId: folder.id,
            metadataFileId: null,
            source: 'cloud',
            format: 'plain-zip',
            encrypted: false,
          })
        }
      }
    }

    database.addActivity({
      type: 'info',
      title: 'Drive scan complete',
      message: `Found ${entries.length} plain ZIP project backup(s) on Google Drive`,
      level: 'success',
    })

    return entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  /** Download cloud backup into local store so restore can run */
  async importCloudBackup(entry: CloudBackupEntry): Promise<string> {
    const paths = getAppPaths()
    const localPath = path.join(paths.backups, `${entry.backupId}.avault`)
    await fs.ensureDir(paths.backups)

    if (!(await fs.pathExists(localPath))) {
      if (!entry.driveFileId) throw new Error('Missing Drive file id')
      await this.downloadBackup(entry.driveFileId, localPath)
    }

    // Reject cached legacy AES files
    const { encryption } = await import('./encryption.js')
    if (await encryption.looksLikeLegacyEncrypted(localPath)) {
      await fs.remove(localPath).catch(() => {})
      throw new Error(
        'This cloud backup is an old encrypted format and was removed from Drive. Run Complete Backup again for a plain ZIP.'
      )
    }

    // Upsert into local DB
    const existing = database.getBackup(entry.backupId)
    if (!existing) {
      database.insertBackup({
        id: entry.backupId,
        projectId: entry.projectId || uuid(),
        projectName: entry.projectName,
        projectPath: entry.projectPath,
        agents: entry.agents,
        chatCount: entry.chatCount,
        sizeBytes: entry.sizeBytes,
        compressedBytes: entry.compressedBytes || (await fs.stat(localPath)).size,
        checksum: 'cloud-import',
        encrypted: false,
        location: 'both',
        cloudPath: entry.driveFileId,
        localPath,
        computerName: entry.computerName,
        platform: process.platform,
        createdAt: entry.createdAt,
        framework: entry.framework,
        compressionRatio: 1,
        incremental: false,
        parentBackupId: null,
      })
    }

    return entry.backupId
  }
}

export const googleDrive = new GoogleDriveService()
