import { describe, expect, it } from 'vitest'
import {
  assertAudioBlock,
  assertNextAudioSequence,
  getAudioBlockTransferables,
  type AudioBlock,
} from './audio.ts'

function createAudioBlock(overrides: Partial<AudioBlock> = {}): AudioBlock {
  return {
    sequence: 4,
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
  })
})
