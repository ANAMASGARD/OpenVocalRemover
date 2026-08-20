import type { ProcessingReasonCode, ProcessingStatus } from '../shared/protocol.ts'
import type { ProcessingPreferences } from '../shared/settings.ts'

export type PopupViewModel = {
  statusLabel: string
  statusTone: 'neutral' | 'active' | 'warning'
  explanation: string
  toggleChecked: boolean
  toggleDisabled: boolean
  mixDisabled: boolean
  mixPercent: number
  mixLabel: string
  modelLabel: string
  backendLabel: string
  latencyLabel: string
}

const REASON_EXPLANATIONS: Record<ProcessingReasonCode, string> = {
  'no-active-tab': 'No active browser tab is available.',
  'unsupported-page': 'Open a standard YouTube watch page to use this extension.',
  'content-unavailable': 'The YouTube tab could not be reached. Reload the page and try again.',
  'no-approved-model': 'No causal model has passed the local benchmark, licensing, and browser compatibility checks. Original YouTube audio is unchanged.',
  'capture-unverified': 'YouTube audio capture has not passed the Chrome and Firefox safety gate. Original audio is unchanged.',
  'worker-failure': 'The local inference worker stopped. Original audio was restored.',
  'deadline-miss': 'Processing missed its realtime deadline. Original audio was restored.',
  'capture-overflow': 'The bounded capture queue filled. Original audio was restored.',
  'playback-overflow': 'The bounded playback queue filled. Original audio was restored.',
  'playback-underflow': 'Processed audio was not ready in time. Original audio was restored.',
  'invalid-block': 'A local audio message was invalid. Original audio was restored.',
  'incompatible-block': 'The processed audio shape did not match this video. Original audio was restored.',
  'stale-session': 'Output from an old video session was discarded. Original audio was restored.',
  'discontinuous-block': 'Processed audio arrived out of order. Original audio was restored.',
  'invalid-command': 'The extension rejected an invalid command. Original audio is unchanged.',
}

function statusPresentation(status: ProcessingStatus): Pick<
  PopupViewModel,
  'statusLabel' | 'statusTone' | 'explanation'
> {
  if (status.reason !== null) {
    const statusLabel = status.state === 'bypassed'
      ? 'Original audio restored'
      : status.state === 'failed'
        ? 'Processing stopped'
        : status.reason === 'no-approved-model'
          ? 'Not available yet'
          : 'Not available on this page'
    return {
      statusLabel,
      statusTone: status.state === 'unsupported' ? 'neutral' : 'warning',
      explanation: REASON_EXPLANATIONS[status.reason],
    }
  }
  switch (status.state) {
    case 'idle':
      return { statusLabel: 'Ready', statusTone: 'neutral', explanation: 'Processing is off. YouTube audio is unchanged.' }
    case 'awaiting-activation':
      return { statusLabel: 'Page confirmation needed', statusTone: 'warning', explanation: 'Confirm processing from the YouTube page before audio is routed.' }
    case 'probing':
      return { statusLabel: 'Checking audio support', statusTone: 'neutral', explanation: 'Verifying this video before changing its audio route.' }
    case 'warming':
      return { statusLabel: 'Starting local processing', statusTone: 'neutral', explanation: 'The local model is preparing a bounded startup buffer.' }
    case 'processing':
      return { statusLabel: 'Processing locally', statusTone: 'active', explanation: 'Best-effort vocal reduction is active on this tab.' }
    case 'bypassed':
      return { statusLabel: 'Original audio restored', statusTone: 'warning', explanation: 'Processing stopped safely. Original audio is playing.' }
    case 'unsupported':
      return { statusLabel: 'Not available', statusTone: 'neutral', explanation: 'This tab does not support local processing.' }
    case 'failed':
      return { statusLabel: 'Processing stopped', statusTone: 'warning', explanation: 'Processing stopped safely. Original audio is unchanged.' }
  }
}

export function toPopupViewModel(
  status: ProcessingStatus | null,
  preferences: ProcessingPreferences,
  busy = false,
): PopupViewModel {
  if (status === null) {
    return {
      statusLabel: 'Checking this tab…',
      statusTone: 'neutral',
      explanation: 'Reading local extension status.',
      toggleChecked: false,
      toggleDisabled: true,
      mixDisabled: true,
      mixPercent: Math.round(preferences.processedMix * 100),
      mixLabel: 'Processed signal mix',
      modelLabel: 'Checking…',
      backendLabel: 'Not started',
      latencyLabel: 'Not measured',
    }
  }
  const presentation = statusPresentation(status)
  const unsupported = status.state === 'unsupported' || status.reason === 'content-unavailable'
  return {
    ...presentation,
    toggleChecked: status.enabled,
    toggleDisabled: busy || unsupported,
    mixDisabled: busy || unsupported,
    mixPercent: Math.round(preferences.processedMix * 100),
    mixLabel: 'Processed signal mix',
    modelLabel: status.model?.label ?? 'None approved',
    backendLabel: status.backend === 'wasm-simd'
      ? 'WebAssembly SIMD · 1 thread'
      : status.backend === 'wasm'
        ? 'WebAssembly · 1 thread'
        : 'Not started',
    latencyLabel: status.bufferedLatencyMs === null
      ? 'Not measured'
      : `${Math.round(status.bufferedLatencyMs)} ms`,
  }
}
