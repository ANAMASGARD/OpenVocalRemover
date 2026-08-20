import { describe, expect, it } from 'vitest'
import { parseFirefoxBenchmarkRecord } from './benchmark-record.ts'

const passingRecord = {
  schemaVersion: 1,
  machineTier: 'A',
  supportDecision: 'supported',
  browserVersion: '153.0.3',
  operatingSystem: 'Linux',
  cpuDescription: 'Representative AVX2 laptop CPU',
  availableMemoryGiB: 16,
  modelId: 'causal-fixture',
  modelSha256: 'a'.repeat(64),
  ortVersion: '1.27.0',
  backend: 'wasm-simd',
  threadCount: 1,
  sampleRateHz: 48_000,
  channelCount: 2,
  frameCount: 2_560,
  hopFrameCount: 512,
  algorithmicLatencyMs: 80,
  warmupMs: 200,
  p50InferenceMs: 2,
  p95InferenceMs: 4,
  hopDurationMs: 10.67,
  peakRetainedMemoryMiB: 90,
  realtimeFactor: 2.2,
  maximumEndToEndLatencyMs: 95,
  sustainedQueueGrowth: false,
  audibleDropoutCount: 0,
  failureRestoredOriginalWithin100Ms: true,
  testMediaDescription: 'Permitted stereo music fixture',
} as const

describe('Firefox benchmark record', () => {
  it('accepts a redacted supported-machine record that passes every live gate', () => {
    expect(parseFirefoxBenchmarkRecord(passingRecord)).toEqual(passingRecord)
  })

  it('rejects a supported decision when p95 exceeds half the hop', () => {
    expect(() => parseFirefoxBenchmarkRecord({
      ...passingRecord,
      p95InferenceMs: 6,
    })).toThrow(/supported decision contradicts/)
  })

  it('allows a failing machine only when it is explicitly unsupported', () => {
    const record = {
      ...passingRecord,
      machineTier: 'C',
      supportDecision: 'unsupported',
      p95InferenceMs: 20,
      audibleDropoutCount: 3,
    } as const

    expect(parseFirefoxBenchmarkRecord(record)).toEqual(record)
  })

  it('rejects URLs and invalid checksums from committed aggregate evidence', () => {
    expect(() => parseFirefoxBenchmarkRecord({
      ...passingRecord,
      testMediaDescription: 'https://www.youtube.com/watch?v=private-id',
    })).toThrow(/must not contain a URL/)
    expect(() => parseFirefoxBenchmarkRecord({
      ...passingRecord,
      modelSha256: 'unknown',
    })).toThrow(/SHA-256/)
  })
})
