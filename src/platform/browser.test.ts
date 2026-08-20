import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getActiveTab,
  getActiveTabId,
  getExtensionApi,
  getLocalStorage,
  sendRuntimeMessage,
  sendTabMessage,
  setLocalStorage,
} from './browser.ts'

type ChromeMock = {
  runtime: {
    sendMessage: ReturnType<typeof vi.fn>
    onInstalled: { addListener: ReturnType<typeof vi.fn> }
  }
  storage: {
    local: {
      get: ReturnType<typeof vi.fn>
      set: ReturnType<typeof vi.fn>
    }
  }
  tabs: {
    query: ReturnType<typeof vi.fn>
    sendMessage: ReturnType<typeof vi.fn>
  }
}

function installChromeMock(partial?: Partial<ChromeMock>): ChromeMock {
  const mock: ChromeMock = {
    runtime: {
      sendMessage: vi.fn(),
      onInstalled: { addListener: vi.fn() },
      ...partial?.runtime,
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        ...partial?.storage?.local,
      },
    },
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
      ...partial?.tabs,
    },
  }

  vi.stubGlobal('chrome', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('browser abstraction', () => {
  it('throws outside an extension context', () => {
    vi.stubGlobal('chrome', undefined)
    expect(() => getExtensionApi()).toThrow(/WebExtensions API is unavailable/)
  })

  it('sends runtime messages through the extension API', async () => {
    const chromeMock = installChromeMock()
    chromeMock.runtime.sendMessage.mockResolvedValue({ ok: true })

    await expect(sendRuntimeMessage({ type: 'ping' })).resolves.toEqual({ ok: true })
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({ type: 'ping' })
  })

  it('sends a command only to the selected tab id', async () => {
    const chromeMock = installChromeMock()
    chromeMock.tabs.sendMessage.mockResolvedValue({ type: 'processing-status' })
    await sendTabMessage(42, { type: 'get-processing-status' })
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      42, { type: 'get-processing-status' },
    )
    await expect(sendTabMessage(-1, {})).rejects.toThrow(/tabId/)
  })

  it('reads and writes local storage', async () => {
    const chromeMock = installChromeMock()
    chromeMock.storage.local.get.mockResolvedValue({ enabled: false })
    chromeMock.storage.local.set.mockResolvedValue(undefined)

    await expect(getLocalStorage(['enabled'])).resolves.toEqual({ enabled: false })
    await setLocalStorage({ enabled: true })

    expect(chromeMock.storage.local.get).toHaveBeenCalledWith(['enabled'])
    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({ enabled: true })
  })

  it('identifies the active tab when present', async () => {
    const chromeMock = installChromeMock()
    chromeMock.tabs.query.mockResolvedValue([
      { id: 42, url: 'https://www.youtube.com/watch?v=demo' },
    ])

    await expect(getActiveTab()).resolves.toEqual({
      id: 42,
      url: 'https://www.youtube.com/watch?v=demo',
    })
    await expect(getActiveTabId()).resolves.toBe(42)
    expect(chromeMock.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    })
  })

  it('returns undefined when no active tab id exists', async () => {
    const chromeMock = installChromeMock()
    chromeMock.tabs.query.mockResolvedValue([{}])

    await expect(getActiveTab()).resolves.toBeUndefined()
    await expect(getActiveTabId()).resolves.toBeUndefined()
  })
})
