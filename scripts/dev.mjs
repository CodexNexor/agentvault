import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import electronPath from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'
import { mkdirSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(path.join(root, 'dist-electron'), { recursive: true })

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  packages: 'external',
  external: ['electron'],
  logLevel: 'info',
  absWorkingDir: root,
}

let electronProc = null

function startElectron(devServerUrl) {
  if (electronProc) {
    electronProc.kill()
    electronProc = null
  }
  electronProc = spawn(
    String(electronPath),
    [path.join(root, 'dist-electron/main.cjs')],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_SERVER_URL: devServerUrl,
      },
    }
  )
  electronProc.on('exit', (code) => {
    if (code === 0) process.exit(0)
  })
}

async function main() {
  // Build electron once first
  await esbuild.build({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.cjs',
  })
  await esbuild.build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
  })

  // Watch electron sources
  const mainCtx = await esbuild.context({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.cjs',
    plugins: [
      {
        name: 'restart-electron',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length === 0 && electronProc) {
              console.log('[electron] main rebuilt — restart')
              startElectron(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
            }
          })
        },
      },
    ],
  })
  const preloadCtx = await esbuild.context({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
  })
  await mainCtx.watch()
  await preloadCtx.watch()

  // Vite renderer
  const server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    root,
  })
  await server.listen()
  const urls = server.resolvedUrls
  const devUrl = urls?.local?.[0] || 'http://localhost:5173/'
  console.log(`[renderer] ${devUrl}`)
  process.env.VITE_DEV_SERVER_URL = devUrl

  startElectron(devUrl)

  process.on('SIGINT', async () => {
    electronProc?.kill()
    await mainCtx.dispose()
    await preloadCtx.dispose()
    await server.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
