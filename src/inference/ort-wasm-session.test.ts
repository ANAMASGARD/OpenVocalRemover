import { describe, expect, it, vi } from 'vitest'
import type { ModelApproval } from './model-gate.ts'
import {
  OrtWasmSessionFactory,
  openSelectedModel,
  type OrtBindings,
  type OrtSessionLike,
} from './ort-wasm-session.ts'

const approval: ModelApproval = {
  artifactPath: 'public/models/fixture/model.onnx',
  artifactSha256: 'a'.repeat(64),
  artifactByteSize: 1,
  measuredPackageByteSize: 2,
  weightLicense: 'fixture',
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
  outputSemantics: 'fixture',
  browserBenchmarks: [],
  qualityEvidence: {
    licensedDataset: 'fixture', objectiveReportPath: 'fixture', listeningReportPath: 'fixture',
  },
}

function fakeBindings(session?: OrtSessionLike) {
  const release = vi.fn(async () => undefined)
  const bindings: OrtBindings = {
    configureWasm: vi.fn(),
    createSession: vi.fn(async () => session ?? {
      inputNames: ['audio'],
      outputNames: ['accompaniment'],
      inputMetadata: [{ name: 'audio', isTensor: true, type: 'float32', shape: [1, 2, 1_024] }],
      outputMetadata: [{ name: 'accompaniment', isTensor: true, type: 'float32', shape: [1, 2, 1_024] }],
      run: vi.fn(async () => ({})),
      release,
    }),
  }
  return { bindings, release }
}

describe('ORT WebAssembly session factory', () => {
  it('does not import or configure ORT when no model is approved', async () => {
    const loadFactory = vi.fn()
    await expect(openSelectedModel(
      { available: false, reason: 'no-approved-model' },
      loadFactory,
    )).resolves.toEqual({ available: false, reason: 'no-approved-model' })
    expect(loadFactory).not.toHaveBeenCalled()
  })

  it('uses one local SIMD thread, no proxy, and extension-local absolute URLs', async () => {
    const { bindings, release } = fakeBindings()
    const factory = new OrtWasmSessionFactory(bindings, {
      workerLocationHref: 'moz-extension://extension-id/assets/worker.js',
      mjsAssetUrl: '/assets/ort-runtime.mjs',
      wasmAssetUrl: '/assets/ort-runtime.wasm',
    })

    const session = await factory.create({ id: 'fixture', approval })
    expect(bindings.configureWasm).toHaveBeenCalledWith({
      numThreads: 1,
      proxy: false,
      simd: true,
      wasmPaths: {
        mjs: 'moz-extension://extension-id/assets/ort-runtime.mjs',
        wasm: 'moz-extension://extension-id/assets/ort-runtime.wasm',
      },
    })
    expect(bindings.createSession).toHaveBeenCalledWith(
      'moz-extension://extension-id/models/fixture/model.onnx',
      { executionProviders: ['wasm'], executionMode: 'sequential', graphOptimizationLevel: 'all' },
    )
    await session.release()
    await session.release()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases and rejects a model whose runtime tensor names differ from approval evidence', async () => {
    const release = vi.fn(async () => undefined)
    const { bindings } = fakeBindings({
      inputNames: ['unexpected'],
      outputNames: ['accompaniment'],
      inputMetadata: [{ name: 'unexpected', isTensor: true, type: 'float32', shape: [1, 2, 1_024] }],
      outputMetadata: [{ name: 'accompaniment', isTensor: true, type: 'float32', shape: [1, 2, 1_024] }],
      run: vi.fn(async () => ({})),
      release,
    })
    const factory = new OrtWasmSessionFactory(bindings, {
      workerLocationHref: 'chrome-extension://extension-id/worker.js',
      mjsAssetUrl: '/runtime.mjs',
      wasmAssetUrl: '/runtime.wasm',
    })
    await expect(factory.create({ id: 'fixture', approval })).rejects.toMatchObject({
      code: 'model-interface-mismatch',
    })
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects cross-extension assets and tensor metadata mismatches', async () => {
    const { bindings } = fakeBindings()
    const hostileFactory = new OrtWasmSessionFactory(bindings, {
      workerLocationHref: 'moz-extension://ours/worker.js',
      mjsAssetUrl: 'moz-extension://theirs/runtime.mjs',
      wasmAssetUrl: '/runtime.wasm',
    })
    await expect(hostileFactory.create({ id: 'fixture', approval })).rejects.toMatchObject({
      code: 'unsupported-origin',
    })

    const release = vi.fn(async () => undefined)
    const mismatched = fakeBindings({
      inputNames: ['audio'],
      outputNames: ['accompaniment'],
      inputMetadata: [{ name: 'audio', isTensor: true, type: 'float32', shape: [1, 2, 512] }],
      outputMetadata: [{ name: 'accompaniment', isTensor: true, type: 'float32', shape: [1, 2, 1_024] }],
      run: vi.fn(async () => ({})),
      release,
    })
    const factory = new OrtWasmSessionFactory(mismatched.bindings, {
      workerLocationHref: 'chrome-extension://ours/worker.js',
      mjsAssetUrl: '/runtime.mjs',
      wasmAssetUrl: '/runtime.wasm',
    })
    await expect(factory.create({ id: 'fixture', approval })).rejects.toMatchObject({
      code: 'model-interface-mismatch',
    })
    expect(release).toHaveBeenCalledOnce()
  })

  it('classifies an ORT module import failure', async () => {
    await expect(openSelectedModel(
      { available: true, model: { id: 'fixture', approval } },
      async () => { throw new Error('raw import failure') },
    )).rejects.toMatchObject({ code: 'runtime-initialisation-failed' })
  })
})
