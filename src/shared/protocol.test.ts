import { describe, expect, it } from 'vitest'
import {
  getWorkerRequestTransferables,
  parsePopupCommand,
  parseWorkerRequest,
  parseWorkerResponse,
  type WorkerRequest,
} from './protocol.ts'

function processRequest(): Extract<WorkerRequest, { type: 'process' }> {
  return {
    type: 'process',
    block: {
      sequence: 8,
      sampleRateHz: 48_000,
      channelCount: 2,
      frameCount: 4,
      frames: [new Float32Array(4), new Float32Array(4)],
    },
  }
}

describe('extension processing protocol', () => {
  it('parses only explicit popup activation commands', () => {
    expect(parsePopupCommand({ type: 'set-processing-enabled', enabled: true })).toEqual({
      type: 'set-processing-enabled',
      enabled: true,
    })
    expect(() => parsePopupCommand({ type: 'set-processing-enabled', enabled: 'true' })).toThrow(
      /enabled/,
    )
  })

  it('validates worker process messages and transfers audio buffers deliberately', () => {
    const request = processRequest()

    expect(parseWorkerRequest(request)).toBe(request)
    expect(getWorkerRequestTransferables(request)).toEqual([
      request.block.frames[0]!.buffer,
      request.block.frames[1]!.buffer,
    ])
  })

  it('rejects malformed worker requests and unknown worker responses', () => {
    expect(() => parseWorkerRequest({ type: 'initialise', sampleRateHz: 0, channelCount: 2 })).toThrow(
      /sampleRateHz/,
    )
    expect(() => parseWorkerRequest({ type: 'process', block: { sequence: 1 } })).toThrow(
      /sampleRateHz/,
    )
    expect(() => parseWorkerResponse({ type: 'ready', backend: 'webgpu' })).toThrow(
      /backend/,
    )
  })
})
