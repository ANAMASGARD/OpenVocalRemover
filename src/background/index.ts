/**
 * Minimal MV3 background entry used to establish Chrome/Firefox build shapes.
 * Chrome emits background.service_worker; Firefox emits background.scripts.
 * Feature messaging will attach here in later plan steps.
 */
import { getExtensionApi } from '../platform/browser.ts'
import { ProcessingHostCapabilityBroker } from '../processing-host/capability-broker.ts'
import { createProcessingHostBrokerHandler } from '../processing-host/protocol.ts'

const api = getExtensionApi()

api.runtime.onInstalled.addListener(() => {
  // Capabilities are deliberately memory-only and are not restored on install.
})

const broker = new ProcessingHostCapabilityBroker({ ttlMs: 10_000, maximumPending: 32 })
const handleProcessingHostAuthority = createProcessingHostBrokerHandler(broker, () => Date.now())

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const response = handleProcessingHostAuthority(message, sender)
  if (response === undefined) return undefined
  sendResponse(response)
  return false
})
