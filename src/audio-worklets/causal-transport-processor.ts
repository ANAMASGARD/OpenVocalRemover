import { BoundedAudioBlockQueue, RecyclableAudioBufferPool } from './bounded-transport.ts'
import { assertAudioBlock, type AudioBlock, type ChannelCount } from '../shared/audio.ts'

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
  maximumEndToEndLatencyMs: number
}

type InboundMessage =
  | { type: 'processed'; block: AudioBlock }
  | { type: 'recycle-capture'; buffers: ArrayBuffer[] }
  | { type: 'select-processed' }
  | { type: 'select-raw' }
  | { type: 'reset' }

function isInboundMessage(value: unknown): value is InboundMessage {
  return typeof value === 'object' && value !== null && 'type' in value
}

class CausalTransportProcessor extends AudioWorkletProcessor {
  private readonly configuration: TransportOptions
  private readonly capturePool: RecyclableAudioBufferPool
  private readonly playbackQueue: BoundedAudioBlockQueue
  private sequence = 0
  private startFrame = 0
  private processedSelected = false

  constructor(options?: AudioWorkletNodeOptions) {
    super(options)
    const configuration = options?.processorOptions as Partial<TransportOptions> | undefined
    if (
      configuration?.sessionId === undefined
      || configuration.channelCount === undefined
      || configuration.frameCount === undefined
      || configuration.capturePoolBlockCount === undefined
      || configuration.playbackQueueBlockCount === undefined
      || configuration.maximumEndToEndLatencyMs === undefined
    ) {
      throw new Error('causal transport processor options are incomplete')
    }
    this.configuration = configuration as TransportOptions
    this.capturePool = new RecyclableAudioBufferPool({
      blockCount: this.configuration.capturePoolBlockCount,
      channelCount: this.configuration.channelCount,
      frameCount: this.configuration.frameCount,
    })
    this.playbackQueue = new BoundedAudioBlockQueue(
      this.configuration.playbackQueueBlockCount,
    )
    this.port.onmessage = (event: MessageEvent<unknown>) => this.handleMessage(event.data)
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (input === undefined || output === undefined) {
      return true
    }

    const processed = this.processedSelected ? this.playbackQueue.dequeue() : undefined
    for (let channel = 0; channel < output.length; channel += 1) {
      const target = output[channel]
      if (target === undefined) continue
      const source = processed?.frames[channel] ?? input[channel]
      target.fill(0)
      if (source !== undefined) target.set(source.subarray(0, target.length))
    }
    if (this.processedSelected && processed === undefined) {
      this.processedSelected = false
      this.port.postMessage({ type: 'underflow', sessionId: this.configuration.sessionId })
    }

    const captureFrames = this.capturePool.acquire()
    if (captureFrames === undefined) {
      this.port.postMessage({ type: 'capture-overflow', sessionId: this.configuration.sessionId })
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
    const transfer = captureFrames.map((channel) => channel.buffer as ArrayBuffer)
    this.port.postMessage({ type: 'captured', block }, transfer)
    this.sequence += 1
    this.startFrame += this.configuration.frameCount
    return true
  }

  private handleMessage(value: unknown): void {
    if (!isInboundMessage(value)) return
    if (value.type === 'processed') {
      let block: AudioBlock
      try {
        block = assertAudioBlock(value.block)
      } catch {
        this.port.postMessage({ type: 'invalid-processed-block' })
        return
      }
      if (
        block.sessionId !== this.configuration.sessionId
        || block.channelCount !== this.configuration.channelCount
        || block.frameCount !== this.configuration.frameCount
      ) {
        this.port.postMessage({ type: 'incompatible-processed-block' })
        return
      }
      const result = this.playbackQueue.enqueue(block)
      if (result !== 'accepted') this.port.postMessage({ type: result })
    } else if (value.type === 'recycle-capture') {
      try {
        this.capturePool.release(value.buffers)
      } catch {
        this.port.postMessage({ type: 'invalid-recycled-buffer' })
      }
    } else if (value.type === 'select-processed') {
      this.processedSelected = true
    } else if (value.type === 'select-raw') {
      this.processedSelected = false
    } else {
      this.processedSelected = false
      this.playbackQueue.clear()
      this.sequence = 0
      this.startFrame = 0
    }
  }
}

registerProcessor('open-vocal-remover-transport', CausalTransportProcessor)
