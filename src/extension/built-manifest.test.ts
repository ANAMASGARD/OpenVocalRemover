import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertChromeBackgroundShape,
  assertFirefoxBackgroundShape,
  assertYouTubeContentScriptShape,
  readBuiltManifest,
} from './built-manifest.ts'

function rebuildBrowserTargets(): void {
  execFileSync('npm', ['run', 'build'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
  execFileSync('npm', ['run', 'build:firefox'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
}

function findFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? findFiles(path) : [path]
  })
}

describe('built browser manifests', () => {
  it('emits Chrome service_worker and Firefox scripts backgrounds', () => {
    rebuildBrowserTargets()

    const chromeManifest = readBuiltManifest('chrome')
    const firefoxManifest = readBuiltManifest('firefox')

    expect(() => assertChromeBackgroundShape(chromeManifest)).not.toThrow()
    expect(() => assertFirefoxBackgroundShape(firefoxManifest)).not.toThrow()
    expect(() => assertYouTubeContentScriptShape(chromeManifest)).not.toThrow()
    expect(() => assertYouTubeContentScriptShape(firefoxManifest)).not.toThrow()

    // CRXJS emits a root loader that imports the bundled background chunk.
    expect(chromeManifest.background?.service_worker).toBe('service-worker-loader.js')
    expect(firefoxManifest.background?.scripts).toEqual(['service-worker-loader.js'])
    expect(chromeManifest.background).not.toHaveProperty('scripts')
    expect(firefoxManifest.background).not.toHaveProperty('service_worker')

    for (const manifest of [chromeManifest, firefoxManifest]) {
      expect(manifest.content_security_policy?.extension_pages).toBe(
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      )
      const accessibleResources = manifest.web_accessible_resources ?? []
      expect(accessibleResources).toHaveLength(1)
      expect(accessibleResources[0]?.resources).toContain('index.html')
      expect(accessibleResources[0]?.matches).toEqual(['https://www.youtube.com/*'])
      const resourcePaths = accessibleResources.flatMap((entry) => entry.resources ?? [])
      expect(resourcePaths.some((resource) => resource.endsWith('.ts'))).toBe(false)
      expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
    }

    const runtimeArtifacts = (target: 'chrome' | 'firefox') => {
      const assetDirectory = resolve(process.cwd(), 'dist', target, 'assets')
      return readdirSync(assetDirectory)
        .filter((name) => name.startsWith('ort-wasm-simd-threaded'))
        .sort()
    }
    const chromeArtifacts = runtimeArtifacts('chrome')
    const firefoxArtifacts = runtimeArtifacts('firefox')
    expect(chromeArtifacts).toHaveLength(2)
    expect(firefoxArtifacts).toEqual(chromeArtifacts)
    expect(chromeArtifacts.some((name) => name.endsWith('.mjs'))).toBe(true)
    expect(chromeArtifacts.some((name) => name.endsWith('.wasm'))).toBe(true)
    expect(chromeArtifacts.some((name) => /jsep|jspi|asyncify/u.test(name))).toBe(false)
    const require = createRequire(import.meta.url)
    for (const artifact of chromeArtifacts) {
      const digest = (target: 'chrome' | 'firefox') => createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), 'dist', target, 'assets', artifact)))
        .digest('hex')
      expect(digest('chrome')).toBe(digest('firefox'))
      const sourceExport = artifact.endsWith('.mjs')
        ? 'onnxruntime-web/ort-wasm-simd-threaded.mjs'
        : 'onnxruntime-web/ort-wasm-simd-threaded.wasm'
      const sourceDigest = createHash('sha256')
        .update(readFileSync(require.resolve(sourceExport)))
        .digest('hex')
      expect(digest('chrome')).toBe(sourceDigest)
    }
    for (const target of ['chrome', 'firefox'] as const) {
      const files = findFiles(resolve(process.cwd(), 'dist', target))
      expect(files.some((path) => path.endsWith('.onnx'))).toBe(false)
      expect(files.some((path) => path.endsWith('third-party/onnxruntime-web-LICENSE.txt'))).toBe(true)
    }
  })
})
