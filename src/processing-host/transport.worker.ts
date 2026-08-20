import { EchoTransport } from './transport-echo.ts'

type AttachEndpointMessage = { type: 'attach-audio-endpoint'; sessionId: string }

function isAttachMessage(value: unknown): value is AttachEndpointMessage {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'attach-audio-endpoint'
    && 'sessionId' in value
    && typeof value.sessionId === 'string'
}

self.onmessage = (event: MessageEvent<unknown>) => {
  if (!isAttachMessage(event.data) || event.ports.length !== 1) return
  const endpoint = event.ports[0]!
  const transport = new EchoTransport(event.data.sessionId)
  endpoint.onmessage = (audioEvent: MessageEvent<unknown>) => {
    const result = transport.accept(audioEvent.data)
    if (result.type === 'processed') {
      endpoint.postMessage({ type: 'processed', block: result.block }, result.transfer)
    } else {
      endpoint.postMessage({ type: 'transport-rejected', reason: result.reason })
    }
  }
  endpoint.start()
}
