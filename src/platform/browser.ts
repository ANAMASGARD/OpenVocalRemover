/** Portable WebExtensions surface used by popup, background, and content code. */

export type ExtensionApi = typeof chrome

export type LocalStorageValues = Record<string, unknown>

export type ActiveTab = {
  id: number
  url?: string
}

function requireExtensionApi(): ExtensionApi {
  if (!globalThis.chrome?.runtime) {
    throw new Error('The WebExtensions API is unavailable outside an extension context.')
  }

  return globalThis.chrome
}

/** Returns the browser's portable WebExtensions namespace. */
export function getExtensionApi(): ExtensionApi {
  return requireExtensionApi()
}

/** Send a runtime message and return the typed response. */
export async function sendRuntimeMessage<TResponse>(
  message: unknown,
): Promise<TResponse> {
  const api = requireExtensionApi()
  return api.runtime.sendMessage(message) as Promise<TResponse>
}

/** Read values from `browser.storage.local` / `chrome.storage.local`. */
export async function getLocalStorage(
  keys?: string | string[] | LocalStorageValues | null,
): Promise<LocalStorageValues> {
  const api = requireExtensionApi()
  return api.storage.local.get(keys ?? null) as Promise<LocalStorageValues>
}

/** Write values to local extension storage. */
export async function setLocalStorage(values: LocalStorageValues): Promise<void> {
  const api = requireExtensionApi()
  await api.storage.local.set(values)
}

/**
 * Identify the active tab in the current window.
 * Returns undefined when no tab id is available (for example, no focused window).
 */
export async function getActiveTab(): Promise<ActiveTab | undefined> {
  const api = requireExtensionApi()
  const tabs = await api.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  if (tab?.id == null) {
    return undefined
  }

  return {
    id: tab.id,
    url: tab.url,
  }
}

/** Convenience helper for callers that only need the active tab id. */
export async function getActiveTabId(): Promise<number | undefined> {
  const tab = await getActiveTab()
  return tab?.id
}
