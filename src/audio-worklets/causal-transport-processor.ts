import { RecyclableAudioBufferPool } from './bounded-transport.ts'
import {
  RealtimePlaybackScheduler,
  type PipelineFaultReason,
} from './realtime-scheduler.ts'
import { getAudioBlockTransferables, type AudioBlock, type ChannelCount } from '../shared/audio.ts'
import { parseWorkerAudioMessage } from '../shared/realtime-protocol.ts'

declare const sampleRate: number
declare const currentTime: number
declare const AudioWorkletProcessor: {
  new (options?: AudioWorkletNodeOptions): { readonly port: MessagePort }
}
declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => { process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean },
): void

type TransportOptions = {
  sessionId: string
  channelCount: ChannelCount
  frameCount: number
  capturePoolBlockCount: number
  playbackQueueBlockCount: number
  playbackStartupBlockCount: number
  maximumEndToEndLatencyMs: number
}

type ControlMessage =
  | { type: 'attach-inference-endpoint'; sessionId: string }
  | { type: 'select-processed'; sessionId: string }
  | { type: 'stop-processing'; sessionId: string }

function parseControlMessage(value: unknown, sessionId: string): ControlMessage | undefined {
  if (
    typeof value !== 'object'
    || value === null
    || !('type' in value)
    || !('sessionId' in value)
    || value.sessionId !== sessionId
  ) return undefined
  if (
    value.type !== 'attach-inference-endpoint'
    && value.type !== 'select-processed'
    && value.type !== 'stop-processing'
  ) return undefined
  return { type: value.type, sessionId }
}

class CausalTransportProcessor extends AudioWorkletProcessor {
  private readonly configuration: TransportOptions
  private readonly capturePool: RecyclableAudioBufferPool
  private readonly playbackScheduler: RealtimePlaybackScheduler
  private readonly outstandingCaptureSequences = new Set<number>()
  private endpoint: MessagePort | undefined
  private sequence = 0
  private startFrame = 0
  private processedSelected = false
  private readyReported = false
  private active = false
  private faulted = false

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)
    const configuration = options?.processorOptions as Partial<TransportOptions> | undefined
    if (
      configuration?.sessionId === undefined
      || configuration.channelCount === undefined
      || configuration.frameCount === undefined
      || configuration.capturePoolBlockCount === undefined
      || configuration.playbackQueueBlockCount === undefined
      || configuration.playbackStartupBlockCount === undefined
      || configuration.maximumEndToEndLatencyMs === undefined
    ) throw new Error('causal transport processor options are incomplete')

    this.configuration = configuration as TransportOptions
    this.capturePool = new RecyclableAudioBufferPool({
      blockCount: this.configuration.capturePoolBlockCount,
      channelCount: this.configuration.channelCount,
      frameCount: this.configuration.frameCount,
    })
    this.playbackScheduler = new RealtimePlaybackScheduler({
      sessionId: this.configuration.sessionId,
      channelCount: this.configuration.channelCount,
      frameCount: this.configuration.frameCount,
      capacityBlockCount: this.configuration.playbackQueueBlockCount,
      startupBlockCount: this.configuration.playbackStartupBlockCount,
    })
    this.port.onmessage = (event: MessageEvent<unknown>) => this.handleControl(event)
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (input === undefined || output === undefined) return true

    let processed: AudioBlock | undefined
    if (this.processedSelected && !this.faulted) {
      const scheduled = this.playbackScheduler.take(currentTime * 1_000)
      if (scheduled.type === 'block') processed = scheduled.block
      else if (scheduled.type === 'fault') this.latchFault(scheduled.reason, scheduled.recycle)
    }

    for (let channel = 0; channel < output.length; channel += 1) {
      const target = output[channel]
      if (target === undefined) continue
      const source = processed?.frames[channel] ?? input[channel]
      target.fill(0)
      if (source !== undefined) target.set(source.subarray(0, target.length))
    }
    if (processed !== undefined) this.recycleProcessed(processed)

    if (!this.active || this.faulted || this.endpoint === undefined) return true
    const captureFrames = this.capturePool.acquire()
    if (captureFrames === undefined) {
      this.latchFault('capture-overflow')
      return true
    }
    for (let channel = 0; channel < captureFrames.length; channel += 1) {
      const source = input[channel]
      captureFrames[channel]!.fill(0)
      if (source !== undefined) {
        captureFrames[channel]!.set(source.subarray(0, captureFrames[channel]!.length))
      }
    }
    const capturedAtMs = currentTime * 1_000
    const block: AudioBlock = {
      sessionId: this.configuration.sessionId,
      sequence: this.sequence,
      startFrame: this.startFrame,
      capturedAtMs,
      deadlineAtMs: capturedAtMs + this.configuration.maximumEndToEndLatencyMs,
      sampleRateHz: sampleRate,
      channelCount: this.configuration.channelCount,
      frameCount: this.configuration.frameCount,
      frames: captureFrames,
    }
    const transfer = getAudioBlockTransferables(block)
    try {
      this.endpoint.postMessage({ type: 'captured', block }, transfer)
      this.outstandingCaptureSequences.add(block.sequence)
      this.sequence += 1
      this.startFrame += block.frameCount
    } catch {
      try {
        this.capturePool.release(transfer)
      } catch {
        // The session is terminated below; detached buffers are reclaimed with it.
      }
      this.latchFault('worker-failure')
    }
    return true
  }

  private handleControl(event: MessageEvent<unknown>): void {
    const message = parseControlMessage(event.data, this.configuration.sessionId)
    if (message === undefined) return
    if (message.type === 'attach-inference-endpoint') {
      if (this.endpoint !== undefined || event.ports.length !== 1 || this.faulted) return
      this.endpoint = event.ports[0]!
      this.endpoint.onmessage = (endpointEvent) => this.handleEndpointMessage(endpointEvent.data)
      this.endpoint.start()
      this.active = true
      return
    }
    if (event.ports.length !== 0) return
    if (message.type === 'select-processed') {
      if (this.playbackScheduler.isReady && !this.faulted) this.processedSelected = true
      return
    }
    this.stop()
  }

  private handleEndpointMessage(value: unknown): void {
    if (this.faulted) return
    let message: ReturnType<typeof parseWorkerAudioMessage>
    try {
      message = parseWorkerAudioMessage(value, this.configuration)
    } catch {
      this.latchFault('invalid-block')
      return
    }
    if (message.type === 'capture-recycled') {
      if (!this.outstandingCaptureSequences.delete(message.sequence)) {
        this.latchFault('invalid-block')
        return
      }
      try {
        this.capturePool.release(message.buffers)
      } catch {
        this.latchFault('invalid-block')
      }
      return
    }
    if (message.type === 'pipeline-fault') {
      this.latchFault(message.reason)
      return
    }
    const accepted = this.playbackScheduler.accept(message.block, currentTime * 1_000)
    if (accepted.type === 'fault') {
      this.latchFault(accepted.reason, accepted.recycle)
    } else if (accepted.ready && !this.readyReported) {
      this.readyReported = true
      this.port.postMessage({
        type: 'processing-ready',
        sessionId: this.configuration.sessionId,
        bufferedBlockCount: this.playbackScheduler.bufferedBlockCount,
      })
    }
  }

  private recycleProcessed(block: AudioBlock): void {
    const endpoint = this.endpoint
    if (endpoint === undefined) return
    const buffers = getAudioBlockTransferables(block)
    try {
      endpoint.postMessage({
        type: 'processed-recycled',
        sessionId: this.configuration.sessionId,
        sequence: block.sequence,
        buffers,
      }, buffers)
    } catch {
      this.latchFault('worker-failure')
    }
  }

  private latchFault(reason: PipelineFaultReason, recycle: AudioBlock[] = []): void {
    if (this.faulted) return
    this.faulted = true
    this.active = false
    this.processedSelected = false
    for (const block of [...recycle, ...this.playbackScheduler.fail(reason)]) {
      this.recycleProcessed(block)
    }
    this.port.postMessage({ type: 'pipeline-fault', sessionId: this.configuration.sessionId, reason })
  }

  private stop(): void {
    if (!this.active && this.endpoint === undefined) return
    this.active = false
    this.processedSelected = false
    const recycle = this.playbackScheduler.fail('worker-failure')
    for (const block of recycle) this.recycleProcessed(block)
    this.endpoint?.close()
    this.endpoint = undefined
  }
}

registerProcessor('open-vocal-remover-transport', CausalTransportProcessor)
