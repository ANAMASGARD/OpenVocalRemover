import { describe, expect, it } from 'vitest'
import { manifest } from '../manifest.config'
import { getBrowserTarget, getBuildOutputDir } from '../build-target'

describe('extension manifest', () => {
  it('defines the minimal cross-browser popup foundation', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBe('Open Vocal Remover')
    expect(manifest.action?.default_popup).toBe('index.html')
    expect(manifest.icons?.[128]).toBe('icons/icon-128.png')
    expect(manifest.permissions ?? []).toEqual([])
    expect(manifest.host_permissions ?? []).toEqual([])
  })

  it('includes Firefox release metadata without collecting data', () => {
    expect(manifest.browser_specific_settings?.gecko).toMatchObject({
      id: 'open-vocal-remover@extension.local',
      data_collection_permissions: { required: ['none'] },
    })
  })
})

describe('browser build target', () => {
  it('uses CRXJS Firefox output only for the Firefox mode', () => {
    expect(getBrowserTarget('firefox')).toBe('firefox')
    expect(getBrowserTarget('development')).toBe('chrome')
  })

  it('keeps Chrome and Firefox build artifacts isolated', () => {
    expect(getBuildOutputDir('chrome')).toBe('dist/chrome')
    expect(getBuildOutputDir('firefox')).toBe('dist/firefox')
  })
})
