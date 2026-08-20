import { describe, expect, it } from 'vitest'
import type { ProcessingStatus } from '../shared/protocol.ts'
import { toPopupViewModel } from './popup-view-model.ts'

function status(overrides: Partial<ProcessingStatus> = {}): ProcessingStatus {
  return {
    type: 'processing-status',
    state: 'idle',
    enabled: false,
    reason: null,
    model: { id: 'fixture', label: 'Fixture separator' },
    backend: null,
    bufferedLatencyMs: null,
    ...overrides,
  }
}

describe('popup view model', () => {
  it('truthfully explains that no approved model leaves original audio unchanged', () => {
    const view = toPopupViewModel(status({
      state: 'unsupported', reason: 'no-approved-model', model: null,
    }), { schemaVersion: 1, processedMix: 0.75 })
    expect(view.statusLabel).toBe('Not available yet')
    expect(view.toggleDisabled).toBe(true)
    expect(view.modelLabel).toBe('None approved')
    expect(view.backendLabel).toBe('Not started')
    expect(view.latencyLabel).toBe('Not measured')
    expect(view.explanation).toMatch(/Original YouTube audio is unchanged/)
  })

  it('covers loading, warming, processing, bypass, and failure without false success', () => {
    expect(toPopupViewModel(null, { schemaVersion: 1, processedMix: 0.5 }).statusLabel)
      .toBe('Checking this tab…')
    expect(toPopupViewModel(status({ state: 'warming', enabled: true }), {
      schemaVersion: 1, processedMix: 0.5,
    }).statusLabel).toBe('Starting local processing')
    expect(toPopupViewModel(status({
      state: 'processing', enabled: true, backend: 'wasm-simd', bufferedLatencyMs: 64,
    }), { schemaVersion: 1, processedMix: 0.5 })).toMatchObject({
      statusLabel: 'Processing locally',
      backendLabel: 'WebAssembly SIMD · 1 thread',
      latencyLabel: '64 ms',
    })
    expect(toPopupViewModel(status({
      state: 'bypassed', reason: 'deadline-miss', enabled: false,
    }), { schemaVersion: 1, processedMix: 0.5 }).statusLabel).toBe('Original audio restored')
    expect(toPopupViewModel(status({
      state: 'failed', reason: 'worker-failure', enabled: false,
    }), { schemaVersion: 1, processedMix: 0.5 }).statusLabel).toBe('Processing stopped')
  })

  it('labels the slider as a mix rather than a vocal-removal guarantee', () => {
    const view = toPopupViewModel(status(), { schemaVersion: 1, processedMix: 0.42 })
    expect(view.statusLabel).toBe('Ready')
    expect(view.toggleDisabled).toBe(false)
    expect(view.mixPercent).toBe(42)
    expect(view.mixLabel).toMatch(/signal mix/i)
    expect(view.mixLabel).not.toMatch(/vocal removal/i)
  })

  it('disables controls on unsupported pages and while a command is pending', () => {
    const preferences = { schemaVersion: 1 as const, processedMix: 0.5 }
    expect(toPopupViewModel(status({
      state: 'unsupported', reason: 'unsupported-page', model: null,
    }), preferences)).toMatchObject({
      statusLabel: 'Not available on this page', toggleDisabled: true, mixDisabled: true,
    })
    expect(toPopupViewModel(status(), preferences, true)).toMatchObject({
      toggleDisabled: true, mixDisabled: true,
    })
  })
})
