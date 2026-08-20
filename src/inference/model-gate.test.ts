import { describe, expect, it } from 'vitest'
import modelLockJson from '../../models/model-lock.json'
import { validateModelLock, type ModelLock } from './model-gate.ts'

function approvedModelLock(): ModelLock {
  return {
    schemaVersion: 1,
    selectedModelId: 'causal-test',
    candidates: [
      {
        id: 'causal-test',
        status: 'approved',
        architecture: 'causal-test-network',
        sourceUrl: 'https://example.invalid/model',
        sourceRevision: '0123456789abcdef',
        decisionReason: 'Fixture with complete independent approval evidence.',
        approval: {
          artifactPath: 'public/models/causal-test/model.onnx',
          artifactSha256: 'a'.repeat(64),
          artifactByteSize: 10_000_000,
          measuredPackageByteSize: 20_000_000,
          weightLicense: 'MIT fixture weights',
          attributionPath: 'public/models/causal-test/LICENSE.txt',
          trainingDataProvenance: 'Licensed synthetic fixture corpus.',
          exportSourceUrl: 'https://example.invalid/export',
          exportRevision: 'fedcba9876543210',
          causal: true,
          sampleRateHz: 48_000,
          channelCount: 2,
          frameCount: 1_024,
          hopFrameCount: 1_024,
          algorithmicLatencyFrameCount: 1_024,
          inputTensors: [{ name: 'audio', dataType: 'float32', shape: [1, 2, 1_024] }],
          outputTensors: [{ name: 'accompaniment', dataType: 'float32', shape: [1, 2, 1_024] }],
          outputSemantics: 'Stereo accompaniment for the current causal hop.',
          browserBenchmarks: [
            {
              browser: 'chrome',
              browserVersion: 'fixture',
              operatingSystem: 'fixture',
              cpu: 'fixture',
              ortBackend: 'wasm-simd',
              hopDurationMs: 21.33,
              p95InferenceMs: 10,
              peakMemoryMiB: 128,
              sustainedQueueGrowth: false,
            },
            {
              browser: 'firefox',
              browserVersion: 'fixture',
              operatingSystem: 'fixture',
              cpu: 'fixture',
              ortBackend: 'wasm-simd',
              hopDurationMs: 21.33,
              p95InferenceMs: 10,
              peakMemoryMiB: 128,
              sustainedQueueGrowth: false,
            },
          ],
          qualityEvidence: {
            licensedDataset: 'Synthetic fixture stems',
            objectiveReportPath: 'docs/benchmarks/causal-test-objective.json',
            listeningReportPath: 'docs/benchmarks/causal-test-listening.md',
          },
        },
      },
    ],
  }
}

describe('causal model approval gate', () => {
  it('accepts the research registry with no selected production model', () => {
    const lock = validateModelLock(modelLockJson)
    expect(lock.selectedModelId).toBeNull()
    expect(lock.candidates.every((candidate) => candidate.status !== 'approved')).toBe(true)
  })

  it('accepts one fully evidenced causal model', () => {
    expect(validateModelLock(approvedModelLock()).selectedModelId).toBe('causal-test')
  })

  it('rejects incomplete approval, excessive package size, and slow browser inference', () => {
    const incomplete = approvedModelLock()
    delete incomplete.candidates[0]!.approval
    expect(() => validateModelLock(incomplete)).toThrow(/approval evidence/)

    const oversized = approvedModelLock()
    oversized.candidates[0]!.approval!.measuredPackageByteSize = 151 * 1024 * 1024
    expect(() => validateModelLock(oversized)).toThrow(/150 MiB/)

    const slow = approvedModelLock()
    slow.candidates[0]!.approval!.browserBenchmarks[1]!.p95InferenceMs = 11
    expect(() => validateModelLock(slow)).toThrow(/half the hop duration/)
  })

  it('rejects a selected model that is not uniquely approved', () => {
    const lock = approvedModelLock()
    lock.selectedModelId = 'unknown'
    expect(() => validateModelLock(lock)).toThrow(/selectedModelId/)
  })
})
