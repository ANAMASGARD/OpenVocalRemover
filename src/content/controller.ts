import type { PopupCommand, ProcessingStatus } from '../shared/protocol.ts'
import type { RealtimePipelineAvailability } from './audio-pipeline.ts'

export type ProcessingLifecycle = {
  enable(): void
  disable(): void
}

type ControllerAvailability =
  | RealtimePipelineAvailability
  | { available: true; modelId: null }

/**
 * Owns the explicit enabled state for one content script. Audio routing is not
 * created here; later phases attach that work to the lifecycle callbacks.
 */
export class ContentProcessingController {
  private enabled = false

  constructor(
    private readonly lifecycle: ProcessingLifecycle,
    private readonly availability: ControllerAvailability = { available: true, modelId: null },
  ) {}

  handlePopupCommand(command: PopupCommand): ProcessingStatus {
    if (command.type === 'get-processing-status') {
      return this.getStatus()
    }

    if (command.enabled === this.enabled) {
      return this.getStatus()
    }

    if (command.enabled && !this.availability.available) {
      return this.getStatus()
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
    const model = typeof this.availability.modelId === 'string'
      ? { id: this.availability.modelId, label: this.availability.modelId }
      : null
    if (!this.availability.available) {
      return {
        type: 'processing-status',
        state: 'unsupported',
        enabled: false,
        reason: this.availability.reason,
        model,
        backend: null,
        bufferedLatencyMs: null,
      }
    }
    return {
      type: 'processing-status',
      // Probing truthfully indicates enablement before capture/model support is known.
      state: this.enabled ? 'probing' : 'idle',
      enabled: this.enabled,
      reason: null,
      model,
      backend: null,
      bufferedLatencyMs: null,
    }
  }
}
