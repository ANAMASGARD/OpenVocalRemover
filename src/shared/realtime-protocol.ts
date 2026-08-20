import { assertAudioBlock, type AudioBlock, type ChannelCount } from './audio.ts'

export type PipelineFaultReason =
  | 'worker-failure'
  | 'deadline-miss'
  | 'capture-overflow'
  | 'playback-overflow'
  | 'playback-underflow'
  | 'invalid-block'
  | 'incompatible-block'
  | 'stale-session'
  | 'discontinuous-block'

export type RealtimeEndpointShape = {
  sessionId: string
  channelCount: ChannelCount
  frameCount: number
}

export type WorkerAudioMessage =
  | { type: 'capture-recycled'; sessionId: string; sequence: number; buffers: ArrayBuffer[] }
  | { type: 'processed'; block: AudioBlock }
  | { type: 'pipeline-fault'; sessionId: string; reason: PipelineFaultReason }

export type WorkletStatus =
  | { type: 'processing-ready'; sessionId: string; bufferedBlockCount: number }
  | { type: 'pipeline-fault'; sessionId: string; reason: PipelineFaultReason }

export type CaptureMessage = { type: 'captured'; block: AudioBlock }
export type ProcessedRecycleMessage = {
  type: 'processed-recycled'
  sessionId: string
  sequence: number
  buffers: ArrayBuffer[]
}

const PIPELINE_FAULT_REASONS = new Set<PipelineFaultReason>([
  'worker-failure',
  'deadline-miss',
  'capture-overflow',
  'playback-overflow',
  'playback-underflow',
  'invalid-block',
  'incompatible-block',
  'stale-session',
  'discontinuous-block',
])

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }
  return value as Record<string, unknown>
}

function readSessionId(record: Record<string, unknown>, expected?: string): string {
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    throw new Error('message sessionId must be a non-empty string')
  }
  if (expected !== undefined && record.sessionId !== expected) {
    throw new Error('message session does not match the active session')
  }
  return record.sessionId
}

function readSequence(record: Record<string, unknown>): number {
  if (!Number.isInteger(record.sequence) || (record.sequence as number) < 0) {
    throw new Error('message sequence must be a non-negative integer')
  }
  return record.sequence as number
}

function readFaultReason(record: Record<string, unknown>): PipelineFaultReason {
  if (!PIPELINE_FAULT_REASONS.has(record.reason as PipelineFaultReason)) {
    throw new Error('message fault reason is unsupported')
  }
  return record.reason as PipelineFaultReason
}

function readBuffers(
  record: Record<string, unknown>,
  channelCount: ChannelCount,
  frameCount: number,
): ArrayBuffer[] {
  if (!Array.isArray(record.buffers) || record.buffers.length !== channelCount) {
    throw new Error('message buffers must match channelCount')
  }
  const byteLength = frameCount * Float32Array.BYTES_PER_ELEMENT
  if (record.buffers.some((buffer) => !(buffer instanceof ArrayBuffer) || buffer.byteLength !== byteLength)) {
    throw new Error('message buffers must match frameCount')
  }
  return record.buffers as ArrayBuffer[]
}

export function parseWorkerAudioMessage(
  value: unknown,
  expected: RealtimeEndpointShape,
): WorkerAudioMessage {
  const record = asRecord(value, 'worker audio message')
  if (record.type === 'processed') {
    const block = assertAudioBlock(record.block, 'processed block')
    if (block.sessionId !== expected.sessionId) throw new Error('processed block session mismatch')
    return { type: record.type, block }
  }
  const sessionId = readSessionId(record, expected.sessionId)
  if (record.type === 'capture-recycled') {
    return {
      type: record.type,
      sessionId,
      sequence: readSequence(record),
      buffers: readBuffers(record, expected.channelCount, expected.frameCount),
    }
  }
  if (record.type === 'pipeline-fault') {
    return { type: record.type, sessionId, reason: readFaultReason(record) }
  }
  throw new Error('worker audio message type is unsupported')
}

export function parseWorkletStatus(value: unknown): WorkletStatus {
  const record = asRecord(value, 'worklet status')
  const sessionId = readSessionId(record)
  if (record.type === 'processing-ready') {
    if (!Number.isInteger(record.bufferedBlockCount) || (record.bufferedBlockCount as number) <= 0) {
      throw new Error('bufferedBlockCount must be a positive integer')
    }
    return {
      type: record.type,
      sessionId,
      bufferedBlockCount: record.bufferedBlockCount as number,
    }
  }
  if (record.type === 'pipeline-fault') {
    return { type: record.type, sessionId, reason: readFaultReason(record) }
  }
  throw new Error('worklet status type is unsupported')
}
