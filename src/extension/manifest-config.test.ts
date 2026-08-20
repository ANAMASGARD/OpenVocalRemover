import { describe, expect, it } from 'vitest'
import manifestFactory from '../../manifest.config.ts'

async function resolveManifest(mode: string) {
  if (typeof manifestFactory === 'function') {
    return manifestFactory({
      mode,
      command: 'build',
      isSsrBuild: false,
    })
  }

  return manifestFactory
}

describe('manifest configuration', () => {
  it('registers only an inactive YouTube watch-page content-script foundation', async () => {
    const manifest = await resolveManifest('production')

    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBe('Open Vocal Remover')
    expect(manifest.action?.default_popup).toBe('index.html')
    expect(manifest.icons?.[128]).toBe('icons/icon-128.png')
    expect(manifest.permissions ?? []).toEqual(['activeTab', 'storage'])
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    })
    expect(manifest.host_permissions ?? []).toEqual(['https://www.youtube.com/watch*'])
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://www.youtube.com/watch*'],
        js: ['src/content/index.ts'],
        run_at: 'document_idle',
      },
    ])
    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['index.html'],
        matches: ['https://www.youtube.com/*'],
      },
      {
        resources: ['assets/causal-transport-processor-*.js'],
        matches: ['https://www.youtube.com/*'],
      },
    ])
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
  })

  it('uses Chrome service_worker background for non-Firefox modes', async () => {
    const manifest = await resolveManifest('production')

    expect(manifest.background).toEqual({
      service_worker: 'src/background/index.ts',
      type: 'module',
    })
  })

  it('uses Firefox scripts background for the Firefox mode', async () => {
    const manifest = await resolveManifest('firefox')

    expect(manifest.background).toEqual({
      scripts: ['src/background/index.ts'],
    })
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    })
  })

  it('includes Firefox release metadata without collecting data', async () => {
    const manifest = await resolveManifest('firefox')

    expect(manifest.browser_specific_settings?.gecko).toMatchObject({
      id: 'open-vocal-remover@extension.local',
      data_collection_permissions: { required: ['none'] },
    })
  })
})
