import {
  assertAudioBlock,
  getAudioBlockTransferables,
  type AudioBlock,
  type ChannelCount,
} from './audio.ts'

export type ProcessingState =
  | 'idle'
  | 'arming'
  | 'buffering'
  | 'processing'
  | 'bypassed'
  | 'error'

export type InferenceBackend = 'wasm-simd' | 'wasm'

export type PopupCommand =
  | { type: 'get-processing-status' }
  | { type: 'set-processing-enabled'; enabled: boolean }

export type ProcessingStatus = {
  type: 'processing-status'
  state: ProcessingState
  reason?: string
}

export type WorkerRequest =
  | {
      type: 'initialise'
      sampleRateHz: number
      channelCount: ChannelCount
      modelId: string
    }
  | { type: 'process'; block: AudioBlock }
  | { type: 'dispose' }

export type WorkerResponse =
  | { type: 'ready'; backend: InferenceBackend }
  | { type: 'processed'; block: AudioBlock }
  | { type: 'failure'; operation: WorkerRequest['type']; message: string; fatal: boolean }

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }

  return value as UnknownRecord
}

function readType(record: UnknownRecord, label: string): string {
  if (typeof record.type !== 'string') {
    throw new Error(`${label}.type must be a string`)
  }

  return record.type
}

function readPositiveInteger(record: UnknownRecord, key: string, label: string): number {
  const value = record[key]
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`${label}.${key} must be a positive integer`)
  }

  return value as number
}

function readChannelCount(record: UnknownRecord, label: string): ChannelCount {
  if (record.channelCount !== 1 && record.channelCount !== 2) {
    throw new Error(`${label}.channelCount must be 1 or 2`)
  }

  return record.channelCount
}

function readString(record: UnknownRecord, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`)
  }

  return value
}

function readBoolean(record: UnknownRecord, key: string, label: string): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new Error(`${label}.${key} must be a boolean`)
  }

  return value
}

/** Parses commands accepted from the popup; unknown commands are rejected. */
export function parsePopupCommand(value: unknown): PopupCommand {
  const record = asRecord(value, 'popup command')
  const type = readType(record, 'popup command')

  if (type === 'get-processing-status') {
    return { type }
  }
  if (type === 'set-processing-enabled') {
    return { type, enabled: readBoolean(record, 'enabled', 'popup command') }
  }

  throw new Error(`Unsupported popup command type: ${JSON.stringify(type)}`)
}

/** Parses one worker request before it is allowed into the inference queue. */
export function parseWorkerRequest(value: unknown): WorkerRequest {
  const record = asRecord(value, 'worker request')
  const type = readType(record, 'worker request')

  if (type === 'initialise') {
    readPositiveInteger(record, 'sampleRateHz', 'worker request')
    readChannelCount(record, 'worker request')
    readString(record, 'modelId', 'worker request')
    return value as WorkerRequest
  }
  if (type === 'process') {
    assertAudioBlock(record.block, 'worker request.block')
    return value as WorkerRequest
  }
  if (type === 'dispose') {
    return value as WorkerRequest
  }

  throw new Error(`Unsupported worker request type: ${JSON.stringify(type)}`)
}

/** Parses one response returned by the worker; unknown states are rejected. */
export function parseWorkerResponse(value: unknown): WorkerResponse {
  const record = asRecord(value, 'worker response')
  const type = readType(record, 'worker response')

  if (type === 'ready') {
    if (record.backend !== 'wasm-simd' && record.backend !== 'wasm') {
      throw new Error('worker response.backend must be wasm-simd or wasm')
    }
    return { type, backend: record.backend }
  }
  if (type === 'processed') {
    return { type, block: assertAudioBlock(record.block, 'worker response.block') }
  }
  if (type === 'failure') {
    const operation = readType({ type: record.operation }, 'worker response.operation')
    if (operation !== 'initialise' && operation !== 'process' && operation !== 'dispose') {
      throw new Error('worker response.operation must name a worker request type')
    }
    return {
      type,
      operation,
      message: readString(record, 'message', 'worker response'),
      fatal: readBoolean(record, 'fatal', 'worker response'),
    }
  }

  throw new Error(`Unsupported worker response type: ${JSON.stringify(type)}`)
}

/** Returns transferables only for process requests; control messages transfer none. */
export function getWorkerRequestTransferables(request: WorkerRequest): ArrayBuffer[] {
  return request.type === 'process' ? getAudioBlockTransferables(request.block) : []
}
