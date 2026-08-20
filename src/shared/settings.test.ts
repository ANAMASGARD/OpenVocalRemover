import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PIPELINE_CONFIGURATION,
  DEFAULT_PROCESSING_PREFERENCES,
  calculateWorstCasePipelineLatencyMs,
  parseProcessingPreferences,
  validatePipelineConfiguration,
} from './settings.ts'

describe('processing settings', () => {
  it('defaults to disabled processing and a causal pipeline within 100 milliseconds', () => {
    expect(DEFAULT_PROCESSING_PREFERENCES).toEqual({ schemaVersion: 1, processedMix: 0.75 })
    expect(DEFAULT_PIPELINE_CONFIGURATION.maximumEndToEndLatencyMs).toBe(100)
    expect(DEFAULT_PIPELINE_CONFIGURATION.maximumCaptureQueueBlockCount).toBe(4)
    expect(DEFAULT_PIPELINE_CONFIGURATION.maximumPlaybackQueueBlockCount).toBe(4)
    expect(DEFAULT_PIPELINE_CONFIGURATION).not.toHaveProperty('initialBufferDurationMs')
    expect(calculateWorstCasePipelineLatencyMs(DEFAULT_PIPELINE_CONFIGURATION)).toBeLessThanOrEqual(
      100,
    )
    expect(() => validatePipelineConfiguration(DEFAULT_PIPELINE_CONFIGURATION)).not.toThrow()
  })

  it('recovers safely from malformed stored settings', () => {
    expect(parseProcessingPreferences({ schemaVersion: 1, processedMix: 0.6 })).toEqual({
      schemaVersion: 1, processedMix: 0.6,
    })
    expect(parseProcessingPreferences({ schemaVersion: 1, processedMix: 2 }))
      .toEqual(DEFAULT_PROCESSING_PREFERENCES)
    expect(parseProcessingPreferences({ enabled: true })).toEqual(DEFAULT_PROCESSING_PREFERENCES)
    expect(parseProcessingPreferences(null)).toEqual(DEFAULT_PROCESSING_PREFERENCES)
  })

  it('rejects a configuration that violates the causal latency contract', () => {
    expect(() =>
      validatePipelineConfiguration({
        ...DEFAULT_PIPELINE_CONFIGURATION,
        maximumEndToEndLatencyMs: 101,
      }),
    ).toThrow(/maximumEndToEndLatencyMs/)

    expect(() =>
      validatePipelineConfiguration({
        ...DEFAULT_PIPELINE_CONFIGURATION,
        processingDeadlineMs: 11,
      }),
    ).toThrow(/half of the model hop/)

    expect(() =>
      validatePipelineConfiguration({
        ...DEFAULT_PIPELINE_CONFIGURATION,
        maximumCaptureQueueBlockCount: 16,
        maximumPlaybackQueueBlockCount: 16,
      }),
    ).toThrow(/latency budget/)

    expect(() =>
      validatePipelineConfiguration({
        ...DEFAULT_PIPELINE_CONFIGURATION,
        transportBlockFrameCount: 256,
      }),
    ).toThrow(/one render quantum/)
  })
})
