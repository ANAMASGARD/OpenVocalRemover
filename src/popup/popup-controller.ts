import {
  getActiveTab,
  getLocalStorage,
  sendTabMessage,
  setLocalStorage,
  type ActiveTab,
  type LocalStorageValues,
} from '../platform/browser.ts'
import {
  parseProcessingStatus,
  type ProcessingReasonCode,
  type ProcessingStatus,
} from '../shared/protocol.ts'
import {
  DEFAULT_PROCESSING_PREFERENCES,
  PROCESSING_PREFERENCES_STORAGE_KEY,
  parseProcessingPreferences,
  type ProcessingPreferences,
} from '../shared/settings.ts'

export type PopupControllerDependencies = {
  getActiveTab(): Promise<ActiveTab | undefined>
  getLocalStorage(keys?: string | string[] | LocalStorageValues | null): Promise<LocalStorageValues>
  setLocalStorage(values: LocalStorageValues): Promise<void>
  sendTabMessage(tabId: number, message: unknown): Promise<unknown>
}

const DEFAULT_DEPENDENCIES: PopupControllerDependencies = {
  getActiveTab,
  getLocalStorage,
  setLocalStorage,
  sendTabMessage,
}

export type PopupSnapshot = {
  tabId?: number
  preferences: ProcessingPreferences
  status: ProcessingStatus
}

export function localProcessingStatus(
  state: 'unsupported' | 'failed',
  reason: ProcessingReasonCode,
): ProcessingStatus {
  return {
    type: 'processing-status',
    state,
    enabled: false,
    reason,
    model: null,
    backend: null,
    bufferedLatencyMs: null,
  }
}

function isSupportedYouTubeWatchUrl(value: string | undefined): boolean {
  if (value === undefined) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname === 'www.youtube.com'
      && url.pathname === '/watch'
  } catch {
    return false
  }
}

async function loadPreferences(deps: PopupControllerDependencies): Promise<ProcessingPreferences> {
  try {
    const stored = await deps.getLocalStorage(PROCESSING_PREFERENCES_STORAGE_KEY)
    return parseProcessingPreferences(stored[PROCESSING_PREFERENCES_STORAGE_KEY])
  } catch {
    return { ...DEFAULT_PROCESSING_PREFERENCES }
  }
}

export async function loadPopupSnapshot(
  deps: PopupControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<PopupSnapshot> {
  const [preferences, tab] = await Promise.all([
    loadPreferences(deps),
    deps.getActiveTab().catch(() => undefined),
  ])
  if (tab === undefined) {
    return { preferences, status: localProcessingStatus('unsupported', 'no-active-tab') }
  }
  if (!isSupportedYouTubeWatchUrl(tab.url)) {
    return {
      tabId: tab.id,
      preferences,
      status: localProcessingStatus('unsupported', 'unsupported-page'),
    }
  }
  try {
    const response = await deps.sendTabMessage(tab.id, { type: 'get-processing-status' })
    return { tabId: tab.id, preferences, status: parseProcessingStatus(response) }
  } catch {
    return {
      tabId: tab.id,
      preferences,
      status: localProcessingStatus('failed', 'content-unavailable'),
    }
  }
}

export async function setProcessingEnabled(
  tabId: number,
  enabled: boolean,
  deps: PopupControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ProcessingStatus> {
  try {
    const response = await deps.sendTabMessage(tabId, {
      type: 'set-processing-enabled', enabled,
    })
    return parseProcessingStatus(response)
  } catch {
    return localProcessingStatus('failed', 'content-unavailable')
  }
}

export async function saveProcessedMix(
  processedMix: number,
  deps: PopupControllerDependencies = DEFAULT_DEPENDENCIES,
): Promise<ProcessingPreferences> {
  if (!Number.isFinite(processedMix) || processedMix < 0 || processedMix > 1) {
    throw new Error('processedMix must be between 0 and 1')
  }
  const preferences: ProcessingPreferences = { schemaVersion: 1, processedMix }
  await deps.setLocalStorage({ [PROCESSING_PREFERENCES_STORAGE_KEY]: preferences })
  return preferences
}
