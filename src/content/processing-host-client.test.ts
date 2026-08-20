import { describe, expect, it, vi } from 'vitest'
import { ProcessingHostSession } from './processing-host-client.ts'

describe('processing host session', () => {
  it('opens one transferable audio endpoint and closes idempotently', () => {
    const iframe = { remove: vi.fn() } as unknown as HTMLIFrameElement
    const controlPort = {
      postMessage: vi.fn(),
      close: vi.fn(),
      start: vi.fn(),
      onmessage: null,
    } as unknown as MessagePort
    const session = new ProcessingHostSession('session-1', iframe, controlPort)

    const endpoint = session.openAudioEndpoint()
    expect(endpoint).toBeInstanceOf(MessagePort)
    expect(controlPort.postMessage).toHaveBeenCalledWith(
      { type: 'open-audio-endpoint', sessionId: 'session-1' },
      [expect.any(MessagePort)],
    )
    endpoint.close()
    expect(() => session.openAudioEndpoint()).toThrow(/already open/)

    session.close()
    session.close()
    expect(controlPort.close).toHaveBeenCalledOnce()
    expect(iframe.remove).toHaveBeenCalledOnce()
    expect(() => session.openAudioEndpoint()).toThrow(/closed/)
  })

  it('forwards only validated same-session worker failures', () => {
    const controlPort = {
      postMessage: vi.fn(), close: vi.fn(), start: vi.fn(), onmessage: null,
    } as unknown as MessagePort
    const session = new ProcessingHostSession(
      'session-1',
      { remove: vi.fn() } as unknown as HTMLIFrameElement,
      controlPort,
    )
    const listener = vi.fn()
    session.onWorkerFailure(listener)
    controlPort.onmessage?.({ data: {
      type: 'processing-host-worker-failed', sessionId: 'old-session',
    } } as MessageEvent)
    controlPort.onmessage?.({ data: {
      type: 'processing-host-worker-failed', sessionId: 'session-1',
    } } as MessageEvent)
    expect(listener).toHaveBeenCalledOnce()
  })
})
