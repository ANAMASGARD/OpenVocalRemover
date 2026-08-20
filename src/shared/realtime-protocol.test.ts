import { describe, expect, it } from 'vitest'
import { createAudioBlockFixture } from '../test/audio-fixtures.ts'
import {
  parseWorkerAudioMessage,
  parseWorkletStatus,
} from './realtime-protocol.ts'

const expected = { sessionId: 'session-1', channelCount: 2 as const, frameCount: 128 }

describe('realtime endpoint protocol', () => {
  it('validates processed blocks and recycled buffer ownership', () => {
    const block = createAudioBlockFixture({ sessionId: 'session-1' })
    expect(parseWorkerAudioMessage({ type: 'processed', block }, expected)).toMatchObject({
      type: 'processed', block: { sequence: 0 },
    })
    const buffers = [new ArrayBuffer(512), new ArrayBuffer(512)]
    expect(parseWorkerAudioMessage({
      type: 'capture-recycled', sessionId: 'session-1', sequence: 0, buffers,
    }, expected)).toMatchObject({ type: 'capture-recycled', sequence: 0 })
  })

  it('rejects wrong sessions, malformed buffers, and unknown fault reasons', () => {
    expect(() => parseWorkerAudioMessage({
      type: 'capture-recycled', sessionId: 'old', sequence: 0,
      buffers: [new ArrayBuffer(512), new ArrayBuffer(512)],
    }, expected)).toThrow(/session/)
    expect(() => parseWorkerAudioMessage({
      type: 'capture-recycled', sessionId: 'session-1', sequence: 0,
      buffers: [new ArrayBuffer(8)],
    }, expected)).toThrow(/buffers/)
    expect(() => parseWorkerAudioMessage({
      type: 'pipeline-fault', sessionId: 'session-1', reason: 'anything',
    }, expected)).toThrow(/fault reason/)
  })

  it('strictly validates worklet status messages', () => {
    expect(parseWorkletStatus({
      type: 'processing-ready', sessionId: 'session-1', bufferedBlockCount: 2,
    })).toEqual({ type: 'processing-ready', sessionId: 'session-1', bufferedBlockCount: 2 })
    expect(() => parseWorkletStatus({
      type: 'pipeline-fault', sessionId: '', reason: 'deadline-miss',
    })).toThrow(/sessionId/)
  })
})
