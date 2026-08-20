import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config.ts'
import { getBrowserTarget, getBuildOutputDir } from './build-target.ts'

export default defineConfig(({ mode }) => {
  const browser = getBrowserTarget(mode)
  const port = browser === 'firefox' ? 5174 : 5173

  return {
    plugins: [react(), ...crx({ manifest, browser })],
    resolve: {
      // ORT's external-Wasm export keeps the Emscripten module and binary as
      // separately packaged extension assets instead of embedding a worker.
      conditions: [
        'onnxruntime-web-use-extern-wasm',
        'module',
        'browser',
        'development|production',
      ],
    },
    build: {
      outDir: getBuildOutputDir(browser),
    },
    // Keep Chrome and Firefox HMR servers on distinct ports even if a caller
    // omits `--port` when launching `vite --mode firefox`.
    server: {
      port,
      strictPort: true,
    },
  }
})
