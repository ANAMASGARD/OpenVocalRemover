import { describe, expect, it, vi } from 'vitest'
import type { SelectedModel } from './runtime-model.ts'
import {
  parseInferenceRuntimeStatus,
  startInferenceWorkerEndpoint,
} from './inference-worker-runtime.ts'

function endpoint() {
  return {
    postMessage: vi.fn(),
    close: vi.fn(),
    start: vi.fn(),
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  }
}

describe('inference worker endpoint startup', () => {
  it('reports no approved model and never loads ORT', async () => {
    const port = endpoint()
    const openModel = vi.fn()
    await startInferenceWorkerEndpoint(
      'session-1',
      port,
      { available: false, reason: 'no-approved-model' },
      openModel,
    )
    expect(openModel).not.toHaveBeenCalled()
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'inference-unavailable',
      sessionId: 'session-1',
      reason: 'no-approved-model',
    })
    expect(port.close).toHaveBeenCalledOnce()
  })

  it('reports only sanitized startup failure information', async () => {
    const port = endpoint()
    const model = { id: 'fixture', approval: {} } as SelectedModel
    await startInferenceWorkerEndpoint(
      'session-2',
      port,
      { available: true, model },
      vi.fn(async () => { throw new Error('/private/path/model.onnx failed') }),
    )
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'inference-failed',
      sessionId: 'session-2',
      reason: 'runtime-initialisation-failed',
    })
    expect(JSON.stringify(port.postMessage.mock.calls)).not.toContain('/private/path')
  })

  it('strictly validates statuses crossing the endpoint', () => {
    expect(parseInferenceRuntimeStatus({
      type: 'inference-runtime-ready',
      sessionId: 'session-3',
      modelId: 'fixture',
      backend: 'wasm-simd',
    })).toMatchObject({ type: 'inference-runtime-ready', modelId: 'fixture' })
    expect(() => parseInferenceRuntimeStatus({
      type: 'inference-runtime-ready',
      sessionId: 'session-3',
      modelId: 'fixture',
      backend: 'webgpu',
    })).toThrow(/unsupported/)
    expect(() => parseInferenceRuntimeStatus({
      type: 'inference-failed',
      sessionId: '',
      reason: '/private/path',
    })).toThrow(/sessionId/)
  })
})
