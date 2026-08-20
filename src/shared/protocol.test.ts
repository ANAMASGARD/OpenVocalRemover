import { describe, expect, it } from 'vitest'
import {
  getWorkerRequestTransferables,
  parsePopupCommand,
  parseProcessingStatus,
  parseWorkerRequest,
  parseWorkerResponse,
  type WorkerRequest,
} from './protocol.ts'

function processRequest(): Extract<WorkerRequest, { type: 'process' }> {
  return {
    type: 'process',
    block: {
      sessionId: 'session-8',
      sequence: 8,
      startFrame: 1_024,
      capturedAtMs: 2_000,
      deadlineAtMs: 2_090,
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

  it('validates complete popup status without accepting arbitrary reasons', () => {
    expect(parseProcessingStatus({
      type: 'processing-status',
      state: 'unsupported',
      enabled: false,
      reason: 'no-approved-model',
      model: null,
      backend: null,
      bufferedLatencyMs: null,
    })).toMatchObject({ state: 'unsupported', reason: 'no-approved-model' })
    expect(() => parseProcessingStatus({
      type: 'processing-status',
      state: 'unsupported',
      enabled: false,
      reason: '/private/path',
      model: null,
      backend: null,
      bufferedLatencyMs: null,
    })).toThrow(/reason/)
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
    expect(() =>
      parseWorkerRequest({
        type: 'initialise',
        sessionId: 'session-1',
        sampleRateHz: 0,
        channelCount: 2,
        modelId: 'model',
        modelFrameCount: 1_024,
        modelHopFrameCount: 1_024,
      }),
    ).toThrow(/sampleRateHz/)
    expect(() => parseWorkerRequest({ type: 'process', block: { sequence: 1 } })).toThrow(
      /sessionId/,
    )
    expect(() =>
      parseWorkerResponse({ type: 'ready', sessionId: 'session-1', backend: 'webgpu' }),
    ).toThrow(
      /backend/,
    )
  })
})
