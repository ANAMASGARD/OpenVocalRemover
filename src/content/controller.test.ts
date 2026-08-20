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
    })

    expect(
      controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: true }),
    ).toEqual({ type: 'processing-status', state: 'arming' })
    expect(lifecycle.enable).toHaveBeenCalledTimes(1)

    controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: true })
    expect(lifecycle.enable).toHaveBeenCalledTimes(1)

    expect(
      controller.handlePopupCommand({ type: 'set-processing-enabled', enabled: false }),
    ).toEqual({ type: 'processing-status', state: 'idle' })
    expect(lifecycle.disable).toHaveBeenCalledTimes(1)
  })
})
