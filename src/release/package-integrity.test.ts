import { describe, expect, it } from 'vitest'
import {
  assertFirefoxReleasePackage,
  type FirefoxReleasePackageInput,
} from './package-integrity.ts'

function validPackage(): FirefoxReleasePackageInput {
  return {
    archiveByteSize: 14_000_000,
    selectedModelId: null,
    entries: [
      'manifest.json',
      'index.html',
      'service-worker-loader.js',
      'icons/icon-16.png',
      'icons/icon-32.png',
      'icons/icon-48.png',
      'icons/icon-128.png',
      'assets/mount.js',
      'assets/ort-wasm-simd-threaded.mjs',
      'assets/ort-wasm-simd-threaded.wasm',
      'third-party/onnxruntime-web-LICENSE.txt',
    ],
    manifest: {
      manifest_version: 3,
      version: '0.1.0',
      background: { scripts: ['service-worker-loader.js'] },
      permissions: ['activeTab', 'storage'],
      host_permissions: ['https://www.youtube.com/watch*'],
      browser_specific_settings: {
        gecko: {
          id: 'open-vocal-remover@extension.local',
          data_collection_permissions: { required: ['none'] },
        },
      },
    },
  }
}

describe('Firefox release package integrity', () => {
  it('accepts a root-manifest archive with only the expected local runtime assets', () => {
    expect(() => assertFirefoxReleasePackage(validPackage())).not.toThrow()
  })

  it('rejects a nested manifest, source files, maps, or dependency directories', () => {
    for (const invalidEntry of [
      'firefox/manifest.json',
      'src/content/index.ts',
      'assets/index.js.map',
      'node_modules/library/index.js',
    ]) {
      const input = validPackage()
      input.entries = input.entries.filter((entry) => entry !== 'manifest.json')
      input.entries.push(invalidEntry)
      expect(() => assertFirefoxReleasePackage(input)).toThrow()
    }
  })

  it('requires the stable Gecko ID, no-data declaration, and Firefox background shape', () => {
    const input = validPackage()
    input.manifest.background = { service_worker: 'worker.js' }
    input.manifest.browser_specific_settings = {
      gecko: {
        id: 'temporary@example.invalid',
        data_collection_permissions: { required: ['technicalAndInteraction'] },
      },
    }

    expect(() => assertFirefoxReleasePackage(input)).toThrow()
  })

  it('rejects an ONNX artifact while no model is selected', () => {
    const input = validPackage()
    input.entries.push('models/unapproved/model.onnx')

    expect(() => assertFirefoxReleasePackage(input)).toThrow(/no model is selected/)
  })

  it('rejects oversized packages and remote or broad manifest access', () => {
    const input = validPackage()
    input.archiveByteSize = 201 * 1024 * 1024
    input.manifest.host_permissions = ['<all_urls>']

    expect(() => assertFirefoxReleasePackage(input)).toThrow()
  })
})
