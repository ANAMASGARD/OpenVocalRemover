import type { LocalModelSession } from './ort-wasm-session.ts'
import type { ModelSelection, SelectedModel } from './runtime-model.ts'

export type InferenceEndpoint = Pick<MessagePort, 'postMessage' | 'close' | 'start'> & {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
}

export type InferenceRuntimeStatus =
  | {
      type: 'inference-unavailable'
      sessionId: string
      reason: 'no-approved-model'
    }
  | {
      type: 'inference-runtime-ready'
      sessionId: string
      modelId: string
      backend: 'wasm-simd'
    }
  | {
      type: 'inference-failed'
      sessionId: string
      reason: 'runtime-initialisation-failed'
    }

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('inference status must be a plain object')
  }
  return value as Record<string, unknown>
}

function readSessionId(record: Record<string, unknown>): string {
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    throw new Error('inference status sessionId must be a non-empty string')
  }
  return record.sessionId
}

/** Validates every status before it crosses into the audio control plane. */
export function parseInferenceRuntimeStatus(value: unknown): InferenceRuntimeStatus {
  const record = asRecord(value)
  const sessionId = readSessionId(record)
  if (record.type === 'inference-unavailable' && record.reason === 'no-approved-model') {
    return { type: record.type, sessionId, reason: record.reason }
  }
  if (
    record.type === 'inference-runtime-ready'
    && typeof record.modelId === 'string'
    && record.modelId.trim().length > 0
    && record.backend === 'wasm-simd'
  ) {
    return { type: record.type, sessionId, modelId: record.modelId, backend: record.backend }
  }
  if (
    record.type === 'inference-failed'
    && record.reason === 'runtime-initialisation-failed'
  ) {
    return { type: record.type, sessionId, reason: record.reason }
  }
  throw new Error('unsupported inference runtime status')
}

type OpenModel = (model: SelectedModel) => Promise<LocalModelSession>

function isDisposeMessage(value: unknown, sessionId: string): boolean {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === 'dispose-inference-runtime'
    && 'sessionId' in value
    && value.sessionId === sessionId
}

/** Starts one capability-scoped inference endpoint. PCM handling is Task 11. */
export async function startInferenceWorkerEndpoint(
  sessionId: string,
  endpoint: InferenceEndpoint,
  selection: ModelSelection,
  openModel: OpenModel,
): Promise<void> {
  if (!selection.available) {
    endpoint.postMessage({
      type: 'inference-unavailable',
      sessionId,
      reason: selection.reason,
    } satisfies InferenceRuntimeStatus)
    endpoint.close()
    return
  }

  try {
    const modelSession = await openModel(selection.model)
    let disposed = false
    endpoint.onmessage = (event) => {
      if (disposed || !isDisposeMessage(event.data, sessionId)) return
      disposed = true
      void modelSession.release().finally(() => endpoint.close())
    }
    endpoint.start()
    endpoint.postMessage({
      type: 'inference-runtime-ready',
      sessionId,
      modelId: modelSession.modelId,
      backend: modelSession.backend,
    } satisfies InferenceRuntimeStatus)
  } catch {
    endpoint.postMessage({
      type: 'inference-failed',
      sessionId,
      reason: 'runtime-initialisation-failed',
    } satisfies InferenceRuntimeStatus)
    endpoint.close()
  }
}
