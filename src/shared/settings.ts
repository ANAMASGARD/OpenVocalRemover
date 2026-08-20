import type { ChannelCount } from './audio.ts'

export type ProcessingPreferences = {
  schemaVersion: 1
  processedMix: number
}

export type PipelineConfiguration = {
  sampleRateHz: number
  channelCount: ChannelCount
  renderQuantumFrameCount: number
  transportBlockFrameCount: number
  modelFrameCount: number
  modelHopFrameCount: number
  algorithmicLatencyFrameCount: number
  maximumCaptureQueueBlockCount: number
  maximumPlaybackQueueBlockCount: number
  playbackStartupBlockCount: number
  maximumEndToEndLatencyMs: number
  processingDeadlineMs: number
  crossfadeDurationMs: number
  modelId: string
}

export const PROCESSING_PREFERENCES_STORAGE_KEY = 'processingPreferences'

export const DEFAULT_PROCESSING_PREFERENCES: ProcessingPreferences = Object.freeze({
  schemaVersion: 1,
  processedMix: 0.75,
})

/** Safe placeholder profile; Task 9 must approve a real model before activation. */
export const DEFAULT_PIPELINE_CONFIGURATION: PipelineConfiguration = Object.freeze({
  sampleRateHz: 48_000,
  channelCount: 2,
  renderQuantumFrameCount: 128,
  transportBlockFrameCount: 128,
  modelFrameCount: 1_024,
  modelHopFrameCount: 1_024,
  algorithmicLatencyFrameCount: 1_024,
  maximumCaptureQueueBlockCount: 4,
  maximumPlaybackQueueBlockCount: 4,
  playbackStartupBlockCount: 2,
  maximumEndToEndLatencyMs: 100,
  processingDeadlineMs: 10,
  crossfadeDurationMs: 20,
  modelId: 'unselected',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

/** Reads the one persisted mix preference; activation is deliberately per-tab. */
export function parseProcessingPreferences(value: unknown): ProcessingPreferences {
  if (
    !isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.processedMix !== 'number'
    || !Number.isFinite(value.processedMix)
    || value.processedMix < 0
    || value.processedMix > 1
  ) {
    return { ...DEFAULT_PROCESSING_PREFERENCES }
  }
  return { schemaVersion: 1, processedMix: value.processedMix }
}

export function calculateWorstCasePipelineLatencyMs(
  configuration: PipelineConfiguration,
): number {
  const queuedFrameCount =
    (configuration.maximumCaptureQueueBlockCount
      + configuration.maximumPlaybackQueueBlockCount)
    * configuration.transportBlockFrameCount
  const audioLatencyMs =
    ((queuedFrameCount + configuration.algorithmicLatencyFrameCount)
      / configuration.sampleRateHz)
    * 1_000
  return audioLatencyMs + configuration.processingDeadlineMs + configuration.crossfadeDurationMs
}

/** Validates that a causal profile cannot exceed the product A/V sync budget. */
export function validatePipelineConfiguration(
  configuration: PipelineConfiguration,
): PipelineConfiguration {
  assertPositiveInteger(configuration.sampleRateHz, 'sampleRateHz')
  if (configuration.channelCount !== 1 && configuration.channelCount !== 2) {
    throw new Error('channelCount must be 1 or 2')
  }
  assertPositiveInteger(configuration.renderQuantumFrameCount, 'renderQuantumFrameCount')
  assertPositiveInteger(configuration.transportBlockFrameCount, 'transportBlockFrameCount')
  assertPositiveInteger(configuration.modelFrameCount, 'modelFrameCount')
  assertPositiveInteger(configuration.modelHopFrameCount, 'modelHopFrameCount')
  assertPositiveInteger(configuration.algorithmicLatencyFrameCount, 'algorithmicLatencyFrameCount')
  assertPositiveInteger(
    configuration.maximumCaptureQueueBlockCount,
    'maximumCaptureQueueBlockCount',
  )
  assertPositiveInteger(
    configuration.maximumPlaybackQueueBlockCount,
    'maximumPlaybackQueueBlockCount',
  )
  assertPositiveInteger(configuration.playbackStartupBlockCount, 'playbackStartupBlockCount')
  assertPositiveInteger(configuration.maximumEndToEndLatencyMs, 'maximumEndToEndLatencyMs')
  assertPositiveInteger(configuration.processingDeadlineMs, 'processingDeadlineMs')
  assertPositiveInteger(configuration.crossfadeDurationMs, 'crossfadeDurationMs')

  if (configuration.maximumEndToEndLatencyMs > 100) {
    throw new Error('maximumEndToEndLatencyMs must not exceed 100')
  }
  if (configuration.playbackStartupBlockCount > configuration.maximumPlaybackQueueBlockCount) {
    throw new Error('playbackStartupBlockCount must not exceed the playback queue capacity')
  }
  if (configuration.modelHopFrameCount > configuration.modelFrameCount) {
    throw new Error('modelHopFrameCount must not exceed modelFrameCount')
  }
  if (
    configuration.modelFrameCount % configuration.renderQuantumFrameCount !== 0
    || configuration.modelHopFrameCount % configuration.renderQuantumFrameCount !== 0
  ) {
    throw new Error('model frame counts must align to renderQuantumFrameCount')
  }
  if (configuration.transportBlockFrameCount !== configuration.renderQuantumFrameCount) {
    throw new Error('transportBlockFrameCount must equal one render quantum in v1')
  }

  const hopDurationMs = configuration.modelHopFrameCount / configuration.sampleRateHz * 1_000
  if (configuration.processingDeadlineMs > hopDurationMs / 2) {
    throw new Error('processingDeadlineMs must be no more than half of the model hop duration')
  }
  if (calculateWorstCasePipelineLatencyMs(configuration) > configuration.maximumEndToEndLatencyMs) {
    throw new Error('bounded queues and model latency exceed the end-to-end latency budget')
  }
  if (configuration.modelId.trim().length === 0) {
    throw new Error('modelId must not be empty')
  }
  return configuration
}
