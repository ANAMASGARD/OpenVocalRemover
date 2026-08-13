/**
 * Minimal MV3 background entry used to establish Chrome/Firefox build shapes.
 * Chrome emits background.service_worker; Firefox emits background.scripts.
 * Feature messaging will attach here in later plan steps.
 */
import { getExtensionApi } from '../platform/browser.ts'

const api = getExtensionApi()

api.runtime.onInstalled.addListener(() => {
  // Intentionally empty: this file only anchors the browser-specific background.
})
