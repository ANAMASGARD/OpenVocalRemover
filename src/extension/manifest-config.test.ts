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
  it('defines the shared popup foundation without host permissions', async () => {
    const manifest = await resolveManifest('production')

    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBe('Open Vocal Remover')
    expect(manifest.action?.default_popup).toBe('index.html')
    expect(manifest.icons?.[128]).toBe('icons/icon-128.png')
    expect(manifest.permissions ?? []).toEqual([])
    expect(manifest.host_permissions ?? []).toEqual([])
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
  })

  it('includes Firefox release metadata without collecting data', async () => {
    const manifest = await resolveManifest('firefox')

    expect(manifest.browser_specific_settings?.gecko).toMatchObject({
      id: 'open-vocal-remover@extension.local',
      data_collection_permissions: { required: ['none'] },
    })
  })
})
