import {
  parseInferenceRuntimeStatus,
  type InferenceRuntimeStatus,
} from '../inference/inference-worker-runtime.ts'
import type { ProcessingHostSession } from './processing-host-client.ts'

const DEFAULT_INITIALISATION_TIMEOUT_MS = 15_000

export type ProcessingHostForInference = Pick<
  ProcessingHostSession,
  'sessionId' | 'openAudioEndpoint' | 'onWorkerFailure'
>

export type InferenceEndpointFailureReason =
  | 'invalid-worker-status'
  | 'worker-failure'
  | 'runtime-initialisation-failed'
  | 'initialisation-timeout'
  | 'cancelled'

export class PreparedInferenceEndpoint {
  private transferred = false
  private closed = false

  constructor(
    readonly sessionId: string,
    readonly modelId: string,
    readonly backend: 'wasm-simd',
    private readonly endpoint: MessagePort,
  ) {}

  attachToWorklet(workletControlPort: MessagePort): void {
    if (this.transferred) throw new Error('inference endpoint is already transferred')
    this.transferred = true
    this.endpoint.onmessage = null
    workletControlPort.postMessage(
      { type: 'attach-inference-endpoint', sessionId: this.sessionId },
      [this.endpoint],
    )
  }

  closeBeforeTransfer(): void {
    if (this.transferred || this.closed) return
    this.closed = true
    this.endpoint.postMessage({ type: 'dispose-inference-runtime', sessionId: this.sessionId })
    this.endpoint.close()
  }
}

export type PrepareInferenceEndpointResult =
  | { status: 'ready'; endpoint: PreparedInferenceEndpoint }
  | { status: 'unsupported'; reason: 'no-approved-model' }
  | { status: 'failed'; reason: InferenceEndpointFailureReason }

export type PrepareInferenceEndpointOptions = {
  timeoutMs?: number
  signal?: AbortSignal
}

export function prepareInferenceEndpoint(
  host: ProcessingHostForInference,
  options: PrepareInferenceEndpointOptions = {},
): Promise<PrepareInferenceEndpointResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_INITIALISATION_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve({ status: 'failed', reason: 'initialisation-timeout' })
  }

  let endpoint: MessagePort
  try {
    endpoint = host.openAudioEndpoint()
  } catch {
    return Promise.resolve({ status: 'failed', reason: 'worker-failure' })
  }

  return new Promise((resolve) => {
    let settled = false
    const cleanup: {
      timeout?: ReturnType<typeof setTimeout>
      removeWorkerFailureListener: () => void
    } = { removeWorkerFailureListener: () => undefined }
    const onAbort = (): void => finish({ status: 'failed', reason: 'cancelled' })
    const finish = (result: PrepareInferenceEndpointResult): void => {
      if (settled) return
      settled = true
      if (cleanup.timeout !== undefined) clearTimeout(cleanup.timeout)
      options.signal?.removeEventListener('abort', onAbort)
      cleanup.removeWorkerFailureListener()
      if (result.status !== 'ready') endpoint.close()
      resolve(result)
    }

    cleanup.removeWorkerFailureListener = host.onWorkerFailure(
      () => finish({ status: 'failed', reason: 'worker-failure' }),
    )
    cleanup.timeout = setTimeout(
      () => finish({ status: 'failed', reason: 'initialisation-timeout' }),
      timeoutMs,
    )
    endpoint.onmessage = (event: MessageEvent<unknown>) => {
      let status: InferenceRuntimeStatus
      try {
        status = parseInferenceRuntimeStatus(event.data)
      } catch {
        finish({ status: 'failed', reason: 'invalid-worker-status' })
        return
      }
      if (status.sessionId !== host.sessionId) {
        finish({ status: 'failed', reason: 'invalid-worker-status' })
      } else if (status.type === 'inference-unavailable') {
        finish({ status: 'unsupported', reason: status.reason })
      } else if (status.type === 'inference-failed') {
        finish({ status: 'failed', reason: status.reason })
      } else {
        endpoint.onmessage = null
        finish({
          status: 'ready',
          endpoint: new PreparedInferenceEndpoint(
            status.sessionId,
            status.modelId,
            status.backend,
            endpoint,
          ),
        })
      }
    }
    endpoint.start()
    if (options.signal?.aborted === true) onAbort()
    else options.signal?.addEventListener('abort', onAbort, { once: true })
  })
}
