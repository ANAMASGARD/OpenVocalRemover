import type { ChannelCount } from './audio.ts'

export type ProcessingSettings = {
  enabled: boolean
}

export type PipelineConfiguration = {
  sampleRateHz: number
  channelCount: ChannelCount
  renderQuantumFrameCount: number
  inferenceChunkFrameCount: number
  inferenceHopFrameCount: number
  minimumBufferDurationMs: number
  initialBufferDurationMs: number
  maximumBufferDurationMs: number
  maximumQueuedAudioBlocks: number
  processingDeadlineMs: number
  modelId: string
}

export const DEFAULT_PROCESSING_SETTINGS: ProcessingSettings = Object.freeze({
  enabled: false,
})

/**
 * A deliberately bounded baseline. Model-specific chunking may only replace
 * these values together with benchmark evidence and validation updates.
 */
export const DEFAULT_PIPELINE_CONFIGURATION: PipelineConfiguration = Object.freeze({
  sampleRateHz: 48_000,
  channelCount: 2,
  renderQuantumFrameCount: 128,
  inferenceChunkFrameCount: 16_384,
  inferenceHopFrameCount: 8_192,
  minimumBufferDurationMs: 2_000,
  initialBufferDurationMs: 2_500,
  maximumBufferDurationMs: 3_000,
  maximumQueuedAudioBlocks: 1_125,
  processingDeadlineMs: 1_500,
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

/** Reads persisted settings while treating malformed storage as disabled. */
export function parseProcessingSettings(value: unknown): ProcessingSettings {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    return { ...DEFAULT_PROCESSING_SETTINGS }
  }

  return { enabled: value.enabled }
}

/** Validates the fixed-latency pipeline limits before a pipeline is created. */
export function validatePipelineConfiguration(
  configuration: PipelineConfiguration,
): PipelineConfiguration {
  assertPositiveInteger(configuration.sampleRateHz, 'sampleRateHz')
  if (configuration.channelCount !== 1 && configuration.channelCount !== 2) {
    throw new Error('channelCount must be 1 or 2')
  }
  assertPositiveInteger(configuration.renderQuantumFrameCount, 'renderQuantumFrameCount')
  assertPositiveInteger(configuration.inferenceChunkFrameCount, 'inferenceChunkFrameCount')
  assertPositiveInteger(configuration.inferenceHopFrameCount, 'inferenceHopFrameCount')
  assertPositiveInteger(configuration.minimumBufferDurationMs, 'minimumBufferDurationMs')
  assertPositiveInteger(configuration.initialBufferDurationMs, 'initialBufferDurationMs')
  assertPositiveInteger(configuration.maximumBufferDurationMs, 'maximumBufferDurationMs')
  assertPositiveInteger(configuration.maximumQueuedAudioBlocks, 'maximumQueuedAudioBlocks')
  assertPositiveInteger(configuration.processingDeadlineMs, 'processingDeadlineMs')

  if (
    configuration.minimumBufferDurationMs !== 2_000
    || configuration.maximumBufferDurationMs !== 3_000
    || configuration.initialBufferDurationMs < configuration.minimumBufferDurationMs
    || configuration.initialBufferDurationMs > configuration.maximumBufferDurationMs
  ) {
    throw new Error('initialBufferDurationMs must remain inside the fixed 2–3 second buffer budget')
  }

  if (configuration.inferenceHopFrameCount > configuration.inferenceChunkFrameCount) {
    throw new Error('inferenceHopFrameCount must not exceed inferenceChunkFrameCount')
  }

  if (
    configuration.inferenceChunkFrameCount % configuration.renderQuantumFrameCount !== 0
    || configuration.inferenceHopFrameCount % configuration.renderQuantumFrameCount !== 0
  ) {
    throw new Error('inference frame counts must align to renderQuantumFrameCount')
  }

  if (configuration.modelId.trim().length === 0) {
    throw new Error('modelId must not be empty')
  }

  return configuration
}
