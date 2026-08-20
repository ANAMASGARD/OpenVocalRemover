import { describe, expect, it, vi } from 'vitest'
import { ProcessingHostSession } from './processing-host-client.ts'

describe('processing host session', () => {
  it('opens one transferable audio endpoint and closes idempotently', () => {
    const iframe = { remove: vi.fn() } as unknown as HTMLIFrameElement
    const controlPort = {
      postMessage: vi.fn(),
      close: vi.fn(),
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
})
