import { assertAudioBlock, type AudioBlock, type ChannelCount } from '../shared/audio.ts'
import type { PipelineFaultReason } from '../shared/realtime-protocol.ts'

export type { PipelineFaultReason } from '../shared/realtime-protocol.ts'

export type RealtimeSchedulerConfiguration = {
  sessionId: string
  channelCount: ChannelCount
  frameCount: number
  capacityBlockCount: number
  startupBlockCount: number
}

export type SchedulerFaultResult = {
  type: 'fault'
  reason: PipelineFaultReason
  recycle: AudioBlock[]
}

export type AcceptProcessedResult =
  | { type: 'accepted'; ready: boolean }
  | SchedulerFaultResult

export type TakeProcessedResult =
  | { type: 'warming' }
  | { type: 'block'; block: AudioBlock }
  | SchedulerFaultResult

/**
 * Fixed-capacity scheduler shared with the AudioWorklet. All deadline values
 * are interpreted in the AudioContext clock domain supplied by the caller.
 */
export class RealtimePlaybackScheduler {
  private readonly queue: AudioBlock[] = []
  private nextSequence = 0
  private nextStartFrame = 0
  private ready = false
  private faultReason: PipelineFaultReason | undefined

  constructor(private readonly configuration: RealtimeSchedulerConfiguration) {
    if (configuration.sessionId.trim().length === 0) throw new Error('sessionId must not be empty')
    if (configuration.channelCount !== 1 && configuration.channelCount !== 2) {
      throw new Error('channelCount must be 1 or 2')
    }
    for (const [label, value] of [
      ['frameCount', configuration.frameCount],
      ['capacityBlockCount', configuration.capacityBlockCount],
      ['startupBlockCount', configuration.startupBlockCount],
    ] as const) {
      if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be positive`)
    }
    if (configuration.startupBlockCount > configuration.capacityBlockCount) {
      throw new Error('startupBlockCount must not exceed capacityBlockCount')
    }
  }

  accept(value: unknown, audioClockNowMs: number): AcceptProcessedResult {
    if (this.faultReason !== undefined) return this.faultResult(this.faultReason)
    let block: AudioBlock
    try {
      block = assertAudioBlock(value, 'processed block')
    } catch {
      return this.latchFault('invalid-block')
    }
    if (block.sessionId !== this.configuration.sessionId) return this.latchFault('stale-session')
    if (
      block.channelCount !== this.configuration.channelCount
      || block.frameCount !== this.configuration.frameCount
    ) return this.latchFault('incompatible-block')
    if (block.sequence !== this.nextSequence || block.startFrame !== this.nextStartFrame) {
      return this.latchFault('discontinuous-block')
    }
    if (!Number.isFinite(audioClockNowMs) || audioClockNowMs < 0 || block.deadlineAtMs <= audioClockNowMs) {
      return this.latchFault('deadline-miss', [block])
    }
    if (this.queue.length >= this.configuration.capacityBlockCount) {
      return this.latchFault('playback-overflow', [block])
    }

    this.queue.push(block)
    this.nextSequence += 1
    this.nextStartFrame += block.frameCount
    if (this.queue.length >= this.configuration.startupBlockCount) this.ready = true
    return { type: 'accepted', ready: this.ready }
  }

  take(audioClockNowMs: number): TakeProcessedResult {
    if (this.faultReason !== undefined) return this.faultResult(this.faultReason)
    if (!this.ready) return { type: 'warming' }
    const block = this.queue.shift()
    if (block === undefined) return this.latchFault('playback-underflow')
    if (!Number.isFinite(audioClockNowMs) || audioClockNowMs < 0 || block.deadlineAtMs <= audioClockNowMs) {
      return this.latchFault('deadline-miss', [block])
    }
    return { type: 'block', block }
  }

  fail(reason: PipelineFaultReason): AudioBlock[] {
    if (this.faultReason !== undefined) return []
    this.faultReason = reason
    return this.drain()
  }

  get isReady(): boolean {
    return this.ready && this.faultReason === undefined
  }

  get bufferedBlockCount(): number {
    return this.queue.length
  }

  private latchFault(reason: PipelineFaultReason, extra: AudioBlock[] = []): SchedulerFaultResult {
    if (this.faultReason === undefined) this.faultReason = reason
    return this.faultResult(this.faultReason, extra)
  }

  private faultResult(reason: PipelineFaultReason, extra: AudioBlock[] = []): {
    type: 'fault'; reason: PipelineFaultReason; recycle: AudioBlock[]
  } {
    return { type: 'fault', reason, recycle: [...extra, ...this.drain()] }
  }

  private drain(): AudioBlock[] {
    return this.queue.splice(0, this.queue.length)
  }
}
