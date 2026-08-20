import { getExtensionApi, sendRuntimeMessage } from '../platform/browser.ts'
import type { ProcessingHostAuthorityResponse } from '../processing-host/protocol.ts'

const HOST_HANDSHAKE_TIMEOUT_MS = 5_000

function createCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error('processing host iframe load timed out')),
      HOST_HANDSHAKE_TIMEOUT_MS,
    )
    iframe.addEventListener('load', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
    iframe.addEventListener('error', () => {
      window.clearTimeout(timeout)
      reject(new Error('processing host iframe failed to load'))
    }, { once: true })
  })
}

export class ProcessingHostSession {
  private closed = false
  private audioEndpointOpened = false

  constructor(
    readonly sessionId: string,
    private readonly iframe: HTMLIFrameElement,
    private readonly controlPort: MessagePort,
  ) {}

  openAudioEndpoint(): MessagePort {
    if (this.closed) throw new Error('processing host session is closed')
    if (this.audioEndpointOpened) throw new Error('processing host audio endpoint is already open')
    this.audioEndpointOpened = true
    const channel = new MessageChannel()
    this.controlPort.postMessage(
      { type: 'open-audio-endpoint', sessionId: this.sessionId },
      [channel.port2],
    )
    return channel.port1
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.controlPort.postMessage({ type: 'close-processing-host', sessionId: this.sessionId })
    this.controlPort.close()
    this.iframe.remove()
  }
}

/** Creates the authenticated extension-origin host; it does not claim audio. */
export async function connectProcessingHost(): Promise<ProcessingHostSession> {
  const api = getExtensionApi()
  const sessionId = crypto.randomUUID()
  const capability = createCapability()
  const registration = await sendRuntimeMessage<ProcessingHostAuthorityResponse>({
    type: 'register-processing-host', sessionId, capability,
  })
  if (!registration.ok) throw new Error('processing host capability registration failed')

  const iframe = document.createElement('iframe')
  iframe.hidden = true
  iframe.setAttribute('aria-hidden', 'true')
  iframe.src = `${api.runtime.getURL('index.html')}?context=processing-host`
  const extensionOrigin = new URL(api.runtime.getURL('/')).origin
  const load = waitForIframeLoad(iframe)
  document.documentElement.append(iframe)

  try {
    await load
    if (iframe.contentWindow === null) throw new Error('processing host window is unavailable')
    const channel = new MessageChannel()
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('processing host handshake timed out')),
        HOST_HANDSHAKE_TIMEOUT_MS,
      )
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        window.clearTimeout(timeout)
        if (
          typeof event.data === 'object'
          && event.data !== null
          && 'type' in event.data
          && event.data.type === 'processing-host-ready'
        ) resolve()
        else reject(new Error('processing host rejected the handshake'))
      }
      channel.port1.start()
    })
    iframe.contentWindow.postMessage(
      { type: 'connect-processing-host', sessionId, capability },
      extensionOrigin,
      [channel.port2],
    )
    await ready
    return new ProcessingHostSession(sessionId, iframe, channel.port1)
  } catch (error) {
    iframe.remove()
    void sendRuntimeMessage({ type: 'revoke-processing-host', sessionId }).catch(() => undefined)
    throw error
  }
}
