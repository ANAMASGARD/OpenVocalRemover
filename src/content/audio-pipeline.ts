import transportWorkletModuleUrl from '../audio-worklets/causal-transport-processor.ts?worker&url'
import type { ModelSelection } from '../inference/runtime-model.ts'
import { parseWorkletStatus } from '../shared/realtime-protocol.ts'
import type { PipelineConfiguration } from '../shared/settings.ts'
import type { PreparedInferenceEndpoint } from './inference-client.ts'
import type { ProcessingHostSession } from './processing-host-client.ts'
import type { ReversibleAudioGraph } from './reversible-audio-graph.ts'

export type CaptureCapability = 'unverified' | 'verified'

export type RealtimePipelineAvailability =
  | { available: false; reason: 'no-approved-model' | 'capture-unverified' }
  | { available: true }

export function assessRealtimePipelineAvailability(
  selection: ModelSelection,
  captureCapability: CaptureCapability,
): RealtimePipelineAvailability {
  if (!selection.available) return selection
  if (captureCapability !== 'verified') return { available: false, reason: 'capture-unverified' }
  return { available: true }
}

export type PipelineStopReason =
  | 'worker-failure'
  | 'deadline-miss'
  | 'capture-overflow'
  | 'playback-overflow'
  | 'playback-underflow'
  | 'invalid-block'
  | 'incompatible-block'
  | 'stale-session'
  | 'discontinuous-block'
  | 'seek'
  | 'rate-change'
  | 'pause'
  | 'ended'
  | 'video-replaced'
  | 'navigation'
  | 'disabled'

export type PipelineObservableStatus =
  | { state: 'warming' }
  | { state: 'processing' }
  | { state: 'bypassed'; reason: PipelineStopReason }

export type RealtimePipelineSessionOptions = {
  sessionId: string
  endpoint: PreparedInferenceEndpoint
  workletControlPort: MessagePort
  graph: Pick<ReversibleAudioGraph, 'selectProcessed' | 'failOpen' | 'releaseProcessedPath'>
  host: Pick<ProcessingHostSession, 'close' | 'onWorkerFailure'>
  video: Pick<HTMLVideoElement, 'addEventListener' | 'removeEventListener'>
  onStatus: (status: PipelineObservableStatus) => void
}

const MEDIA_STOP_EVENTS: ReadonlyArray<readonly [string, PipelineStopReason]> = [
  ['seeking', 'seek'],
  ['ratechange', 'rate-change'],
  ['pause', 'pause'],
  ['ended', 'ended'],
]

/** Owns one ready endpoint/worklet/graph session and its fail-open lifecycle. */
export class RealtimePipelineSession {
  private started = false
  private stopped = false
  private stopPromise: Promise<void> | undefined
  private processedSelected = false
  private removeWorkerFailureListener = (): void => undefined
  private readonly mediaListeners: Array<readonly [string, EventListener]> = []

  constructor(private readonly options: RealtimePipelineSessionOptions) {}

  start(): void {
    if (this.started) throw new Error('realtime pipeline session already started')
    this.started = true
    this.options.workletControlPort.onmessage = (event: MessageEvent<unknown>) => {
      if (this.stopped) return
      let status: ReturnType<typeof parseWorkletStatus>
      try {
        status = parseWorkletStatus(event.data)
      } catch {
        void this.stop('invalid-block')
        return
      }
      if (status.sessionId !== this.options.sessionId) return
      if (status.type === 'processing-ready') {
        if (!this.processedSelected) {
          this.processedSelected = true
          this.options.workletControlPort.postMessage({
            type: 'select-processed', sessionId: this.options.sessionId,
          })
          this.options.graph.selectProcessed()
          this.options.onStatus({ state: 'processing' })
        }
        return
      }
      void this.stop(status.reason)
    }
    this.removeWorkerFailureListener = this.options.host.onWorkerFailure(
      () => { void this.stop('worker-failure') },
    )
    for (const [eventName, reason] of MEDIA_STOP_EVENTS) {
      const listener = (): void => { void this.stop(reason) }
      this.mediaListeners.push([eventName, listener])
      this.options.video.addEventListener(eventName, listener)
    }
    try {
      this.options.endpoint.attachToWorklet(this.options.workletControlPort)
      this.options.onStatus({ state: 'warming' })
    } catch (error) {
      void this.stop('worker-failure')
      throw error
    }
  }

  stop(reason: PipelineStopReason): Promise<void> {
    if (this.stopPromise !== undefined) return this.stopPromise
    this.stopped = true
    if (!this.started) this.options.endpoint.closeBeforeTransfer()
    this.options.graph.failOpen()
    this.options.workletControlPort.postMessage({
      type: 'stop-processing', sessionId: this.options.sessionId,
    })
    this.options.workletControlPort.onmessage = null
    this.removeWorkerFailureListener()
    for (const [eventName, listener] of this.mediaListeners) {
      this.options.video.removeEventListener(eventName, listener)
    }
    this.mediaListeners.length = 0
    this.options.onStatus({ state: 'bypassed', reason })
    this.stopPromise = this.options.graph.releaseProcessedPath()
      .finally(() => this.options.host.close())
    return this.stopPromise
  }

  whenStopped(): Promise<void> {
    return this.stopPromise ?? Promise.resolve()
  }
}

export function getTransportWorkletModuleUrl(): string {
  return transportWorkletModuleUrl
}

export type RealtimePipelineDescriptor = {
  availability: RealtimePipelineAvailability
  workletModuleUrl: string
}

export function createRealtimePipelineDescriptor(
  selection: ModelSelection,
  captureCapability: CaptureCapability,
): RealtimePipelineDescriptor {
  return {
    availability: assessRealtimePipelineAvailability(selection, captureCapability),
    workletModuleUrl: getTransportWorkletModuleUrl(),
  }
}

export function createTransportWorkletNode(
  context: BaseAudioContext,
  sessionId: string,
  configuration: PipelineConfiguration,
): AudioWorkletNode {
  return new AudioWorkletNode(context, 'open-vocal-remover-transport', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: configuration.channelCount,
    outputChannelCount: [configuration.channelCount],
    processorOptions: {
      sessionId,
      channelCount: configuration.channelCount,
      frameCount: configuration.transportBlockFrameCount,
      capturePoolBlockCount: configuration.maximumCaptureQueueBlockCount,
      playbackQueueBlockCount: configuration.maximumPlaybackQueueBlockCount,
      playbackStartupBlockCount: configuration.playbackStartupBlockCount,
      maximumEndToEndLatencyMs: configuration.maximumEndToEndLatencyMs,
    },
  })
}
