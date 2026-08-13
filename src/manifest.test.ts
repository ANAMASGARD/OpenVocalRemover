import { describe, expect, it } from 'vitest'
import { getBrowserTarget, getBuildOutputDir } from '../build-target.ts'

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
