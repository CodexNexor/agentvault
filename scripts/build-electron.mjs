import * as esbuild from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('dist-electron', { recursive: true })

const isWatch = process.argv.includes('--watch')

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
}

async function build() {
  const mainCtx = await esbuild.context({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.cjs',
  })

  const preloadCtx = await esbuild.context({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.cjs',
  })

  if (isWatch) {
    await mainCtx.watch()
    await preloadCtx.watch()
    console.log('[electron] watching…')
  } else {
    await mainCtx.rebuild()
    await preloadCtx.rebuild()
    await mainCtx.dispose()
    await preloadCtx.dispose()
    console.log('[electron] build complete')
  }
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
