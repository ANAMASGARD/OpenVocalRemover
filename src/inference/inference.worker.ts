import modelLockJson from '../../models/model-lock.json'
import { startInferenceWorkerEndpoint } from './inference-worker-runtime.ts'
import { loadProductionOrtFactory } from './ort-wasm-session.ts'
import { resolveSelectedModel } from './runtime-model.ts'

type AttachEndpointMessage = { type: 'attach-audio-endpoint'; sessionId: string }

function parseAttachMessage(event: MessageEvent<unknown>): AttachEndpointMessage | undefined {
  const value = event.data
  if (
    typeof value !== 'object'
    || value === null
    || !('type' in value)
    || value.type !== 'attach-audio-endpoint'
    || !('sessionId' in value)
    || typeof value.sessionId !== 'string'
    || value.sessionId.trim().length === 0
    || event.ports.length !== 1
  ) return undefined
  return { type: value.type, sessionId: value.sessionId }
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const message = parseAttachMessage(event)
  if (message === undefined) return
  const endpoint = event.ports[0]!
  void startInferenceWorkerEndpoint(
    message.sessionId,
    endpoint,
    resolveSelectedModel(modelLockJson),
    async (model) => {
      const factory = await loadProductionOrtFactory()
      return factory.create(model)
    },
  )
}
