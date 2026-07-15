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

// CJS globals provided by the esbuild → CommonJS bundle
declare const __dirname: string

// Reduce GPU / multi-instance crashes on Linux Wayland
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('no-sandbox')

// Single instance — prevent OOM from many scans
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
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

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#090909',
    title: 'AgentVault',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  })

  const show = () => {
    if (!mainWindow) return
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }

  mainWindow.once('ready-to-show', show)
  // Fallback if ready-to-show never fires
  setTimeout(show, 2500)

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[AgentVault] did-fail-load', code, desc, url)
    // Retry once from asar dist
    if (mainWindow && !VITE_DEV_SERVER_URL) {
      const html = path.join(RENDERER_DIST, 'index.html')
      if (fs.existsSync(html)) mainWindow.loadFile(html)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    const html = path.join(RENDERER_DIST, 'index.html')
    if (!fs.existsSync(html)) {
      console.error('[AgentVault] Missing UI at', html)
    }
    mainWindow.loadFile(html)
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

  // Delay heavy scan so UI paints first
  setTimeout(() => {
    void runBackgroundScan()
  }, 3000)
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
  if (mainWindow) {
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
      console.error('[AgentVault] Bootstrap error (continuing to open UI):', err)
    }
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((err) => {
    console.error('[AgentVault] Fatal whenReady:', err)
  })

app.on('window-all-closed', () => {
  void autoBackupWatcher.stop()
  database.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void autoBackupWatcher.stop()
  database.close()
})
