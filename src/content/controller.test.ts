import { describe, expect, it, vi } from 'vitest'
import { ContentProcessingController } from './controller.ts'

describe('content processing controller', () => {
  it('enables only after an explicit command and disables idempotently', () => {
    const lifecycle = {
      enable: vi.fn(),
      disable: vi.fn(),
    }
    const controller = new ContentProcessingController(lifecycle)

    expect(controller.handlePopupCommand({ type: 'get-processing-status' })).toEqual({
      type: 'processing-status',
      state: 'idle',
      enabled: false,
      reason: null,
      model: null,
      backend: null,
      bufferedLatencyMs: null,
    })

    expect(
      controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: true }),
    ).toMatchObject({ type: 'processing-status', state: 'probing', enabled: true })
    expect(lifecycle.enable).toHaveBeenCalledTimes(1)

    controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: true })
    expect(lifecycle.enable).toHaveBeenCalledTimes(1)

    expect(
      controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: false }),
    ).toMatchObject({ type: 'processing-status', state: 'idle', enabled: false })
    expect(lifecycle.disable).toHaveBeenCalledTimes(1)
  })

  it('refuses activation before model and capture gates pass', () => {
    const lifecycle = { enable: vi.fn(), disable: vi.fn() }
    const controller = new ContentProcessingController(lifecycle, {
      available: false,
      reason: 'no-approved-model',
    })
    expect(controller.handlePopupCommand({
      type: 'set-processing-enabled', enabled: true,
    })).toEqual({
      type: 'processing-status',
      state: 'unsupported',
      enabled: false,
      reason: 'no-approved-model',
      model: null,
      backend: null,
      bufferedLatencyMs: null,
    })
    expect(lifecycle.enable).not.toHaveBeenCalled()
  })
})
