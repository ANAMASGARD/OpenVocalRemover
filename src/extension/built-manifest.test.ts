import { execFileSync } from 'node:child_process'
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
  })
})
