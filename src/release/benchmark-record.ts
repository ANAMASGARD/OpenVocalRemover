export type FirefoxBenchmarkRecord = {
  schemaVersion: 1
  machineTier: 'A' | 'B' | 'C'
  supportDecision: 'supported' | 'unsupported'
  browserVersion: string
  operatingSystem: string
  cpuDescription: string
  availableMemoryGiB: number
  modelId: string
  modelSha256: string
  ortVersion: string
  backend: 'wasm-simd' | 'wasm'
  threadCount: 1
  sampleRateHz: number
  channelCount: 1 | 2
  frameCount: number
  hopFrameCount: number
  algorithmicLatencyMs: number
  warmupMs: number
  p50InferenceMs: number
  p95InferenceMs: number
  hopDurationMs: number
  peakRetainedMemoryMiB: number
  realtimeFactor: number
  maximumEndToEndLatencyMs: number
  sustainedQueueGrowth: boolean
  audibleDropoutCount: number
  failureRestoredOriginalWithin100Ms: boolean
  testMediaDescription: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Firefox benchmark record must be a plain object')
  }
  return value as Record<string, unknown>
}

function requireSafeString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Firefox benchmark record.${key} must be a non-empty string`)
  }
  if (/\b(?:https?:\/\/|www\.)/iu.test(value)) {
    throw new Error(`Firefox benchmark record.${key} must not contain a URL`)
  }
  return value
}

function requirePositiveNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Firefox benchmark record.${key} must be a positive finite number`)
  }
  return value
}

function requirePositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = requirePositiveNumber(record, key)
  if (!Number.isInteger(value)) {
    throw new Error(`Firefox benchmark record.${key} must be an integer`)
  }
  return value
}

/** Validates a redacted, aggregate result before it can be committed as evidence. */
export function parseFirefoxBenchmarkRecord(value: unknown): FirefoxBenchmarkRecord {
  const record = asRecord(value)
  if (record.schemaVersion !== 1) throw new Error('Firefox benchmark record.schemaVersion must be 1')
  if (record.machineTier !== 'A' && record.machineTier !== 'B' && record.machineTier !== 'C') {
    throw new Error('Firefox benchmark record.machineTier must be A, B, or C')
  }
  if (record.supportDecision !== 'supported' && record.supportDecision !== 'unsupported') {
    throw new Error('Firefox benchmark record.supportDecision is invalid')
  }
  for (const key of [
    'browserVersion',
    'operatingSystem',
    'cpuDescription',
    'modelId',
    'ortVersion',
    'testMediaDescription',
  ]) requireSafeString(record, key)

  if (typeof record.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(record.modelSha256)) {
    throw new Error('Firefox benchmark record.modelSha256 must be a lowercase SHA-256')
  }
  if (record.backend !== 'wasm-simd' && record.backend !== 'wasm') {
    throw new Error('Firefox benchmark record.backend must be a Wasm backend')
  }
  if (record.threadCount !== 1) {
    throw new Error('Firefox benchmark record.threadCount must be 1 for the baseline')
  }
  if (record.channelCount !== 1 && record.channelCount !== 2) {
    throw new Error('Firefox benchmark record.channelCount must be 1 or 2')
  }

  for (const key of [
    'availableMemoryGiB',
    'sampleRateHz',
    'frameCount',
    'hopFrameCount',
    'algorithmicLatencyMs',
    'warmupMs',
    'p50InferenceMs',
    'p95InferenceMs',
    'hopDurationMs',
    'peakRetainedMemoryMiB',
    'realtimeFactor',
    'maximumEndToEndLatencyMs',
  ]) requirePositiveNumber(record, key)
  for (const key of ['sampleRateHz', 'frameCount', 'hopFrameCount']) {
    requirePositiveInteger(record, key)
  }
  if (
    typeof record.audibleDropoutCount !== 'number'
    || !Number.isInteger(record.audibleDropoutCount)
    || record.audibleDropoutCount < 0
  ) {
    throw new Error('Firefox benchmark record.audibleDropoutCount must be a non-negative integer')
  }
  if (typeof record.sustainedQueueGrowth !== 'boolean') {
    throw new Error('Firefox benchmark record.sustainedQueueGrowth must be boolean')
  }
  if (typeof record.failureRestoredOriginalWithin100Ms !== 'boolean') {
    throw new Error(
      'Firefox benchmark record.failureRestoredOriginalWithin100Ms must be boolean',
    )
  }

  if (record.supportDecision === 'supported') {
    const algorithmicLatencyMs = requirePositiveNumber(record, 'algorithmicLatencyMs')
    const p95InferenceMs = requirePositiveNumber(record, 'p95InferenceMs')
    const hopDurationMs = requirePositiveNumber(record, 'hopDurationMs')
    const realtimeFactor = requirePositiveNumber(record, 'realtimeFactor')
    const maximumEndToEndLatencyMs = requirePositiveNumber(
      record,
      'maximumEndToEndLatencyMs',
    )
    const passesLiveGate = algorithmicLatencyMs <= 100
      && p95InferenceMs <= hopDurationMs / 2
      && realtimeFactor >= 1
      && maximumEndToEndLatencyMs <= 100
      && record.sustainedQueueGrowth === false
      && record.audibleDropoutCount === 0
      && record.failureRestoredOriginalWithin100Ms === true
    if (!passesLiveGate) {
      throw new Error('Firefox benchmark supported decision contradicts the measured live gates')
    }
  }

  return value as FirefoxBenchmarkRecord
}
