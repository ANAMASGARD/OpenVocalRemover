import { sendRuntimeMessage } from '../platform/browser.ts'
import { parseHostConnectMessage, type ProcessingHostAuthorityResponse } from './protocol.ts'

const YOUTUBE_ORIGIN = 'https://www.youtube.com'

function isControlMessage(
  value: unknown,
): value is { type: 'open-audio-endpoint' | 'close-processing-host'; sessionId: string } {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && (value.type === 'open-audio-endpoint' || value.type === 'close-processing-host')
    && 'sessionId' in value
    && typeof value.sessionId === 'string'
}

export function startProcessingHostPage(): void {
  let connected = false
  let claimPending = false
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (
      connected
      || claimPending
      || event.origin !== YOUTUBE_ORIGIN
      || event.source !== window.parent
      || event.ports.length !== 1
    ) return

    let request: ReturnType<typeof parseHostConnectMessage>
    try {
      request = parseHostConnectMessage(event.data)
    } catch {
      return
    }
    claimPending = true
    const controlPort = event.ports[0]!
    void sendRuntimeMessage<ProcessingHostAuthorityResponse>({
      type: 'claim-processing-host',
      sessionId: request.sessionId,
      capability: request.capability,
    }).then((authority) => {
      if (!authority.ok) {
        claimPending = false
        controlPort.postMessage({ type: 'processing-host-failed' })
        controlPort.close()
        return
      }

      connected = true
      claimPending = false

      const worker = new Worker(new URL('../inference/inference.worker.ts', import.meta.url), { type: 'module' })
      let workerFailureReported = false
      const reportWorkerFailure = (): void => {
        if (workerFailureReported) return
        workerFailureReported = true
        controlPort.postMessage({
          type: 'processing-host-worker-failed',
          sessionId: request.sessionId,
        })
      }
      worker.addEventListener('error', reportWorkerFailure)
      worker.addEventListener('messageerror', reportWorkerFailure)
      let endpointOpened = false
      controlPort.onmessage = (controlEvent: MessageEvent<unknown>) => {
        if (!isControlMessage(controlEvent.data) || controlEvent.data.sessionId !== request.sessionId) {
          return
        }
        if (controlEvent.data.type === 'close-processing-host') {
          worker.terminate()
          controlPort.close()
          return
        }
        if (controlEvent.ports.length !== 1 || endpointOpened) return
        endpointOpened = true
        worker.postMessage(
          { type: 'attach-audio-endpoint', sessionId: request.sessionId },
          [controlEvent.ports[0]!],
        )
      }
      controlPort.start()
      controlPort.postMessage({ type: 'processing-host-ready' })
    }).catch(() => {
      claimPending = false
      controlPort.postMessage({ type: 'processing-host-failed' })
      controlPort.close()
    })
  })
}
