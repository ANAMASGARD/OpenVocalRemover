import type { PopupCommand, ProcessingStatus } from '../shared/protocol.ts'
import type { RealtimePipelineAvailability } from './audio-pipeline.ts'

export type ProcessingLifecycle = {
  enable(): void
  disable(): void
}

/**
 * Owns the explicit enabled state for one content script. Audio routing is not
 * created here; later phases attach that work to the lifecycle callbacks.
 */
export class ContentProcessingController {
  private enabled = false

  constructor(
    private readonly lifecycle: ProcessingLifecycle,
    private readonly availability: RealtimePipelineAvailability = { available: true },
  ) {}

  handlePopupCommand(command: PopupCommand): ProcessingStatus {
    if (command.type === 'get-processing-status') {
      return this.getStatus()
    }

    if (command.enabled === this.enabled) {
      return this.getStatus()
    }

    if (command.enabled && !this.availability.available) {
      return {
        type: 'processing-status',
        state: 'unsupported',
        reason: this.availability.reason,
      }
    }

    this.enabled = command.enabled
    if (this.enabled) {
      this.lifecycle.enable()
    } else {
      this.lifecycle.disable()
    }

    return this.getStatus()
  }

  private getStatus(): ProcessingStatus {
    if (!this.availability.available) {
      return {
        type: 'processing-status',
        state: 'unsupported',
        reason: this.availability.reason,
      }
    }
    return {
      type: 'processing-status',
      // Probing truthfully indicates enablement before capture/model support is known.
      state: this.enabled ? 'probing' : 'idle',
    }
  }
}
