import { describe, expect, it, vi } from 'vitest'
import {
  PreparedInferenceEndpoint,
  prepareInferenceEndpoint,
  type ProcessingHostForInference,
} from './inference-client.ts'

function host() {
  const channel = new MessageChannel()
  const workerFailureListeners = new Set<() => void>()
  const value: ProcessingHostForInference = {
    sessionId: 'session-1',
    openAudioEndpoint: vi.fn(() => channel.port1),
    onWorkerFailure: vi.fn((listener) => {
      workerFailureListeners.add(listener)
      return () => workerFailureListeners.delete(listener)
    }),
  }
  return {
    value,
    workerPort: channel.port2,
    failWorker: () => {
      for (const listener of workerFailureListeners) listener()
    },
  }
}

describe('inference endpoint client', () => {
  it('waits for a validated ready status and transfers the endpoint once', async () => {
    const fixture = host()
    const pending = prepareInferenceEndpoint(fixture.value)
    fixture.workerPort.postMessage({
      type: 'inference-runtime-ready',
      sessionId: 'session-1',
      modelId: 'fixture',
      backend: 'wasm-simd',
    })
    const result = await pending
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('endpoint did not become ready')
    const workletPort = { postMessage: vi.fn() }
    result.endpoint.attachToWorklet(workletPort as unknown as MessagePort)
    expect(workletPort.postMessage).toHaveBeenCalledWith(
      { type: 'attach-inference-endpoint', sessionId: 'session-1' },
      [expect.any(MessagePort)],
    )
    expect(() => result.endpoint.attachToWorklet(workletPort as unknown as MessagePort))
      .toThrow(/already transferred/)
  })

  it('returns unsupported without exposing an endpoint when no model is approved', async () => {
    const fixture = host()
    const pending = prepareInferenceEndpoint(fixture.value)
    fixture.workerPort.postMessage({
      type: 'inference-unavailable',
      sessionId: 'session-1',
      reason: 'no-approved-model',
    })
    await expect(pending).resolves.toEqual({ status: 'unsupported', reason: 'no-approved-model' })
  })

  it('disposes an untransferred endpoint idempotently', () => {
    const channel = new MessageChannel()
    const post = vi.spyOn(channel.port1, 'postMessage')
    const endpoint = new PreparedInferenceEndpoint(
      'session-1', 'fixture', 'wasm-simd', channel.port1,
    )
    endpoint.closeBeforeTransfer()
    endpoint.closeBeforeTransfer()
    expect(post).toHaveBeenCalledOnce()
  })

  it('fails closed on invalid messages, worker failure, timeout, and cancellation', async () => {
    const invalid = host()
    const invalidPending = prepareInferenceEndpoint(invalid.value)
    invalid.workerPort.postMessage({ type: 'ready', sessionId: 'session-1' })
    await expect(invalidPending).resolves.toEqual({
      status: 'failed', reason: 'invalid-worker-status',
    })

    const crashed = host()
    const crashedPending = prepareInferenceEndpoint(crashed.value)
    crashed.failWorker()
    await expect(crashedPending).resolves.toEqual({ status: 'failed', reason: 'worker-failure' })

    vi.useFakeTimers()
    const timedOut = host()
    const timeoutPending = prepareInferenceEndpoint(timedOut.value, { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    await expect(timeoutPending).resolves.toEqual({
      status: 'failed', reason: 'initialisation-timeout',
    })

    const cancelled = host()
    const abort = new AbortController()
    const cancelledPending = prepareInferenceEndpoint(cancelled.value, { signal: abort.signal })
    abort.abort()
    await expect(cancelledPending).resolves.toEqual({ status: 'failed', reason: 'cancelled' })
    vi.useRealTimers()
  })
})
