/** Audio data that may safely cross the content, worker, and worklet boundaries. */

export type ChannelCount = 1 | 2

export type AudioBlock = {
  /** Monotonically increasing block number, starting at zero. */
  sequence: number
  sampleRateHz: number
  channelCount: ChannelCount
  frameCount: number
  /** One non-interleaved Float32Array for each channel. */
  frames: Float32Array[]
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }

  return value as UnknownRecord
}

function readPositiveInteger(record: UnknownRecord, key: string, label: string): number {
  const value = record[key]
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label}.${key} must be a positive integer`)
  }

  return value as number
}

function readNonNegativeInteger(record: UnknownRecord, key: string, label: string): number {
  const value = record[key]
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label}.${key} must be a non-negative integer`)
  }

  return value as number
}

function readChannelCount(record: UnknownRecord, label: string): ChannelCount {
  const value = record.channelCount
  if (value !== 1 && value !== 2) {
    throw new Error(`${label}.channelCount must be 1 or 2`)
  }

  return value
}

/**
 * Validates a transferable, channel-separated audio block before it enters a
 * bounded queue. Frames must own their full ArrayBuffer so transfer lists do
 * not accidentally include unrelated samples.
 */
export function assertAudioBlock(value: unknown, label = 'audio block'): AudioBlock {
  const record = asRecord(value, label)
  readNonNegativeInteger(record, 'sequence', label)
  readPositiveInteger(record, 'sampleRateHz', label)
  const channelCount = readChannelCount(record, label)
  const frameCount = readPositiveInteger(record, 'frameCount', label)
  const frames = record.frames

  if (!Array.isArray(frames) || frames.length !== channelCount) {
    throw new Error(`${label}.channelCount must match frames length`)
  }

  const seenBuffers = new Set<ArrayBuffer>()
  for (const frame of frames) {
    if (!(frame instanceof Float32Array)) {
      throw new Error(`${label}.frames must contain Float32Array channels`)
    }

    if (frame.length !== frameCount) {
      throw new Error(`${label}.frameCount must match every channel length`)
    }

    if (!(frame.buffer instanceof ArrayBuffer) || frame.byteOffset !== 0 || frame.byteLength !== frame.buffer.byteLength) {
      throw new Error(`${label}.frames must own complete ArrayBuffers`)
    }

    if (seenBuffers.has(frame.buffer)) {
      throw new Error(`${label}.frames must not reuse an ArrayBuffer`)
    }
    seenBuffers.add(frame.buffer)
  }

  // Keep the validated object and its typed arrays intact. Copying samples here
  // would violate the transfer-oriented, allocation-conscious boundary.
  return value as AudioBlock
}

/** Returns the explicit transferable buffers for a validated audio block. */
export function getAudioBlockTransferables(block: AudioBlock): ArrayBuffer[] {
  const validBlock = assertAudioBlock(block)
  const buffers: ArrayBuffer[] = []

  for (const frame of validBlock.frames) {
    if (!(frame.buffer instanceof ArrayBuffer)) {
      throw new Error('audio block frames must use transferable ArrayBuffers')
    }
    buffers.push(frame.buffer)
  }

  return buffers
}

/** Rejects a stale or skipped block before scheduled playback uses it. */
export function assertNextAudioSequence(previousSequence: number, nextSequence: number): void {
  if (!Number.isInteger(previousSequence) || previousSequence < 0) {
    throw new Error('previousSequence must be a non-negative integer')
  }
  if (!Number.isInteger(nextSequence) || nextSequence < 0) {
    throw new Error('nextSequence must be a non-negative integer')
  }

  const expectedSequence = previousSequence + 1
  if (nextSequence !== expectedSequence) {
    throw new Error(`expected ${expectedSequence} after ${previousSequence}, received ${nextSequence}`)
  }
}
