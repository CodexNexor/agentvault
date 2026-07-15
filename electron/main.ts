import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { ensureAppDirs } from './services/paths.js'
import { database } from './services/database.js'
import { encryption } from './services/encryption.js'
import { googleDrive } from './services/google-drive.js'
import { backupEngine } from './services/backup-engine.js'
import { restoreEngine } from './services/restore-engine.js'
import { autoBackupWatcher } from './services/watcher.js'
import { registerIpcHandlers } from './ipc.js'
import { agentRegistry } from './agents/registry.js'
import { projectScanner } from './services/scanner.js'

declare const __dirname: string

// Stability on Linux (Wayland / multi-GPU)
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  // Only if sandbox binary perms wrong; chrome-sandbox should be setuid in packages
  if (process.env.AGENTVAULT_NO_SANDBOX === '1') {
    app.commandLine.appendSwitch('no-sandbox')
  }
}

// Single instance — MUST exit immediately if another is running
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

process.env.APP_ROOT = path.join(__dirname, '..')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let mainWindow: BrowserWindow | null = null
let scanRunning = false

function resolvePreload(): string {
  for (const name of ['preload.cjs', 'preload.js', 'preload.mjs']) {
    const candidate = path.join(__dirname, name)
    if (fs.existsSync(candidate)) return candidate
  }
  return path.join(__dirname, 'preload.cjs')
}

function createWindow(): void {
  nativeTheme.themeSource = 'dark'

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090909',
    title: 'AgentVault',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  const show = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  }

  mainWindow.once('ready-to-show', show)
  setTimeout(show, 2000)

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[AgentVault] did-fail-load', code, desc, url)
    if (mainWindow && !VITE_DEV_SERVER_URL) {
      const html = path.join(RENDERER_DIST, 'index.html')
      if (fs.existsSync(html)) void mainWindow.loadFile(html)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const html = path.join(RENDERER_DIST, 'index.html')
    console.log('[AgentVault] loading UI', html, fs.existsSync(html))
    void mainWindow.loadFile(html)
  }

  backupEngine.setMainWindow(mainWindow)
  restoreEngine.setMainWindow(mainWindow)
  autoBackupWatcher.setMainWindow(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap(): Promise<void> {
  await ensureAppDirs()
  database.initialize()
  await encryption.initialize()
  await googleDrive.initialize()
  registerIpcHandlers(() => mainWindow)

  setTimeout(() => {
    void runBackgroundScan()
  }, 2500)
}

async function runBackgroundScan(): Promise<void> {
  if (scanRunning) return
  scanRunning = true
  try {
    console.log('[AgentVault] Starting initial agent + project scan…')
    database.ensureBackupProjectPaths()
    await agentRegistry.scanAll()
    const projects = await projectScanner.scan()
    console.log(`[AgentVault] Scan done — ${projects.length} AI-linked projects`)
    await autoBackupWatcher.start()
  } catch (err) {
    console.error('[AgentVault] Initial scan failed:', err)
  } finally {
    scanRunning = false
  }
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  } else {
    createWindow()
  }
})

app
  .whenReady()
  .then(async () => {
    try {
      await bootstrap()
    } catch (err) {
      console.error('[AgentVault] Bootstrap error (opening UI anyway):', err)
    }
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  })
  .catch((err) => {
    console.error('[AgentVault] Fatal whenReady:', err)
  })

app.on('window-all-closed', () => {
  void autoBackupWatcher.stop()
  try {
    database.close()
  } catch {
    /* ignore */
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void autoBackupWatcher.stop()
  try {
    database.close()
  } catch {
    /* ignore */
  }
})
