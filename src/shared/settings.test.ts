import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PIPELINE_CONFIGURATION,
  DEFAULT_PROCESSING_SETTINGS,
  parseProcessingSettings,
  validatePipelineConfiguration,
} from './settings.ts'

describe('processing settings', () => {
  it('defaults to disabled processing and a fixed 2–3 second buffer configuration', () => {
    expect(DEFAULT_PROCESSING_SETTINGS).toEqual({ enabled: false })
    expect(DEFAULT_PIPELINE_CONFIGURATION.initialBufferDurationMs).toBe(2_500)
    expect(DEFAULT_PIPELINE_CONFIGURATION.minimumBufferDurationMs).toBe(2_000)
    expect(DEFAULT_PIPELINE_CONFIGURATION.maximumBufferDurationMs).toBe(3_000)
    expect(() => validatePipelineConfiguration(DEFAULT_PIPELINE_CONFIGURATION)).not.toThrow()
  })

  it('recovers safely from malformed stored settings', () => {
    expect(parseProcessingSettings({ enabled: true })).toEqual({ enabled: true })
    expect(parseProcessingSettings({ enabled: 'yes' })).toEqual(DEFAULT_PROCESSING_SETTINGS)
    expect(parseProcessingSettings(null)).toEqual(DEFAULT_PROCESSING_SETTINGS)
  })

  it('rejects a configuration that violates the fixed-latency contract', () => {
    expect(() =>
      validatePipelineConfiguration({
        ...DEFAULT_PIPELINE_CONFIGURATION,
        initialBufferDurationMs: 3_100,
      }),
    ).toThrow(/initialBufferDurationMs/)
  })
})
