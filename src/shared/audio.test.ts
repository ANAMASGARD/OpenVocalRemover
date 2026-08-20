import { describe, expect, it } from 'vitest'
import {
  assertAudioBlock,
  assertAudioBlockContinuity,
  assertNextAudioSequence,
  getAudioBlockTransferables,
  type AudioBlock,
} from './audio.ts'

function createAudioBlock(overrides: Partial<AudioBlock> = {}): AudioBlock {
  return {
    sessionId: 'session-4',
    sequence: 4,
    startFrame: 512,
    capturedAtMs: 1_000,
    deadlineAtMs: 1_090,
    sampleRateHz: 48_000,
    channelCount: 2,
    frameCount: 4,
    frames: [new Float32Array(4), new Float32Array(4)],
    ...overrides,
  }
}

describe('audio block contract', () => {
  it('accepts complete channel-separated blocks and exposes their buffers for transfer', () => {
    const block = createAudioBlock()

    expect(assertAudioBlock(block)).toBe(block)
    expect(getAudioBlockTransferables(block)).toEqual([
      block.frames[0]!.buffer,
      block.frames[1]!.buffer,
    ])
  })

  it('rejects malformed blocks before they enter a worker queue', () => {
    expect(() => assertAudioBlock({ ...createAudioBlock(), sequence: -1 })).toThrow(
      /sequence/,
    )
    expect(() => assertAudioBlock({ ...createAudioBlock(), sessionId: '' })).toThrow(/sessionId/)
    expect(() => assertAudioBlock({ ...createAudioBlock(), startFrame: -1 })).toThrow(/startFrame/)
    expect(() =>
      assertAudioBlock({ ...createAudioBlock(), deadlineAtMs: 999 }),
    ).toThrow(/deadlineAtMs/)
    expect(() => assertAudioBlock({ ...createAudioBlock(), frames: [new Float32Array(4)] })).toThrow(
      /channelCount/,
    )
    expect(() => assertAudioBlock({ ...createAudioBlock(), frames: [new Float32Array(3), new Float32Array(3)] })).toThrow(
      /frameCount/,
    )
  })

  it('requires strictly consecutive processing sequences', () => {
    expect(() => assertNextAudioSequence(4, 5)).not.toThrow()
    expect(() => assertNextAudioSequence(4, 6)).toThrow(/expected 5/)

    const previous = createAudioBlock()
    const next = createAudioBlock({ sequence: 5, startFrame: 516 })
    expect(() => assertAudioBlockContinuity(previous, next)).not.toThrow()
    expect(() =>
      assertAudioBlockContinuity(previous, { ...next, sessionId: 'stale-session' }),
    ).toThrow(/session/)
    expect(() =>
      assertAudioBlockContinuity(previous, { ...next, startFrame: 520 }),
    ).toThrow(/start frame/)
  })
})
