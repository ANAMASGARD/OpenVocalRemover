import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'
import { getBrowserTarget, getBuildOutputDir } from './build-target.ts'

export default defineConfig(({ mode }) => {
  const browser = getBrowserTarget(mode)

  return {
    plugins: [react(), ...crx({ manifest, browser })],
    build: { outDir: getBuildOutputDir(browser) },
  }
})
