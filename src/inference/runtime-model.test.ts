import { describe, expect, it } from 'vitest'
import modelLockJson from '../../models/model-lock.json'
import type { ModelLock } from './model-gate.ts'
import {
  resolveSelectedModel,
  sourceModelPathToRuntimePath,
} from './runtime-model.ts'

function approvedLock(): ModelLock {
  return {
    schemaVersion: 1,
    selectedModelId: 'fixture',
    candidates: [{
      id: 'fixture',
      status: 'approved',
      architecture: 'test',
      sourceUrl: 'https://example.invalid/model',
      sourceRevision: 'revision',
      decisionReason: 'test fixture',
      approval: {
        artifactPath: 'public/models/fixture/model.onnx',
        artifactSha256: 'a'.repeat(64),
        artifactByteSize: 1,
        measuredPackageByteSize: 2,
        weightLicense: 'MIT fixture',
        attributionPath: 'public/models/fixture/LICENSE.txt',
        trainingDataProvenance: 'fixture',
        exportSourceUrl: 'https://example.invalid/export',
        exportRevision: 'revision',
        causal: true,
        sampleRateHz: 48_000,
        channelCount: 2,
        frameCount: 1_024,
        hopFrameCount: 1_024,
        algorithmicLatencyFrameCount: 1_024,
        inputTensors: [{ name: 'audio', dataType: 'float32', shape: [1, 2, 1_024] }],
        outputTensors: [{ name: 'accompaniment', dataType: 'float32', shape: [1, 2, 1_024] }],
        outputSemantics: 'fixture accompaniment',
        browserBenchmarks: [
          {
            browser: 'chrome', browserVersion: 'test', operatingSystem: 'test', cpu: 'test',
            ortBackend: 'wasm-simd', hopDurationMs: 22, p95InferenceMs: 10,
            peakMemoryMiB: 1, sustainedQueueGrowth: false,
          },
          {
            browser: 'firefox', browserVersion: 'test', operatingSystem: 'test', cpu: 'test',
            ortBackend: 'wasm-simd', hopDurationMs: 22, p95InferenceMs: 10,
            peakMemoryMiB: 1, sustainedQueueGrowth: false,
          },
        ],
        qualityEvidence: {
          licensedDataset: 'fixture',
          objectiveReportPath: 'fixture.json',
          listeningReportPath: 'fixture.md',
        },
      },
    }],
  }
}

describe('runtime model selection', () => {
  it('reports the production lock as unavailable without inventing a fallback model', () => {
    expect(resolveSelectedModel(modelLockJson)).toEqual({
      available: false,
      reason: 'no-approved-model',
    })
  })

  it('returns the uniquely approved descriptor and maps its public path to dist', () => {
    const selection = resolveSelectedModel(approvedLock())
    expect(selection.available).toBe(true)
    if (!selection.available) throw new Error('fixture should be available')
    expect(selection.model.id).toBe('fixture')
    expect(sourceModelPathToRuntimePath(selection.model.approval.artifactPath)).toBe(
      'models/fixture/model.onnx',
    )
  })

  it('rejects paths outside the public model root', () => {
    for (const path of [
      'models/fixture/model.onnx',
      'public/models/../model.onnx',
      'public/models/fixture\\model.onnx',
      'public/models/fixture/model.onnx?download=1',
      'public/models/fixture/model.onnx#fragment',
      'public/models/fixture/%2e%2e/model.onnx',
    ]) {
      expect(() => sourceModelPathToRuntimePath(path)).toThrow(/public\/models/)
    }
  })
})
