import { describe, expect, it, vi } from 'vitest'
import {
  loadPopupSnapshot,
  saveProcessedMix,
  setProcessingEnabled,
  type PopupControllerDependencies,
} from './popup-controller.ts'

function dependencies(overrides: Partial<PopupControllerDependencies> = {}): PopupControllerDependencies {
  return {
    getActiveTab: vi.fn(async () => ({
      id: 42, url: 'https://www.youtube.com/watch?v=licensed-test',
    })),
    getLocalStorage: vi.fn(async () => ({
      processingPreferences: { schemaVersion: 1, processedMix: 0.6 },
    })),
    setLocalStorage: vi.fn(async () => undefined),
    sendTabMessage: vi.fn(async () => ({
      type: 'processing-status',
      state: 'unsupported',
      enabled: false,
      reason: 'no-approved-model',
      model: null,
      backend: null,
      bufferedLatencyMs: null,
    })),
    ...overrides,
  }
}

describe('popup controller', () => {
  it('loads preferences and validates status from the active YouTube tab', async () => {
    const deps = dependencies()
    await expect(loadPopupSnapshot(deps)).resolves.toMatchObject({
      tabId: 42,
      preferences: { schemaVersion: 1, processedMix: 0.6 },
      status: { state: 'unsupported', reason: 'no-approved-model' },
    })
    expect(deps.sendTabMessage).toHaveBeenCalledWith(42, { type: 'get-processing-status' })
  })

  it('does not message unsupported pages or fabricate content status', async () => {
    const sendTabMessage = vi.fn()
    const unsupported = dependencies({
      getActiveTab: vi.fn(async () => ({ id: 9, url: 'https://example.com/' })),
      sendTabMessage,
    })
    await expect(loadPopupSnapshot(unsupported)).resolves.toMatchObject({
      status: { state: 'unsupported', reason: 'unsupported-page' },
    })
    expect(sendTabMessage).not.toHaveBeenCalled()

    const missing = dependencies({ getActiveTab: vi.fn(async () => undefined), sendTabMessage })
    await expect(loadPopupSnapshot(missing)).resolves.toMatchObject({
      status: { state: 'unsupported', reason: 'no-active-tab' },
    })
  })

  it('turns malformed or unreachable tab responses into a local failure', async () => {
    const malformed = dependencies({ sendTabMessage: vi.fn(async () => ({ state: 'processing' })) })
    await expect(loadPopupSnapshot(malformed)).resolves.toMatchObject({
      status: { state: 'failed', reason: 'content-unavailable' },
    })
    await expect(setProcessingEnabled(42, true, malformed)).resolves.toMatchObject({
      state: 'failed', reason: 'content-unavailable', enabled: false,
    })
  })

  it('sends explicit activation only to the selected tab and validates the reply', async () => {
    const deps = dependencies({
      sendTabMessage: vi.fn(async () => ({
        type: 'processing-status',
        state: 'warming',
        enabled: true,
        reason: null,
        model: { id: 'fixture', label: 'Fixture' },
        backend: 'wasm-simd',
        bufferedLatencyMs: 32,
      })),
    })
    await expect(setProcessingEnabled(42, true, deps)).resolves.toMatchObject({
      state: 'warming', enabled: true,
    })
    expect(deps.sendTabMessage).toHaveBeenCalledWith(42, {
      type: 'set-processing-enabled', enabled: true,
    })
  })

  it('persists only the versioned mix preference, never activation or page data', async () => {
    const deps = dependencies()
    await saveProcessedMix(0.4, deps)
    expect(deps.setLocalStorage).toHaveBeenCalledWith({
      processingPreferences: { schemaVersion: 1, processedMix: 0.4 },
    })
    const written = JSON.stringify((deps.setLocalStorage as ReturnType<typeof vi.fn>).mock.calls)
    expect(written).not.toMatch(/enabled|youtube|licensed-test|status|url/i)
    await expect(saveProcessedMix(1.1, deps)).rejects.toThrow(/between 0 and 1/)
  })
})
