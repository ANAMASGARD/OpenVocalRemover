import { describe, expect, it } from 'vitest'
import {
  assertAudioBlockShape,
  createConstantAudioBlock,
  createSilentAudioBlock,
  totalFrameBytes,
} from './audio-fixtures.ts'

describe('audio block fixtures', () => {
  it('creates deterministic silent stereo blocks', () => {
    const block = createSilentAudioBlock({
      sequence: 7,
      sampleRateHz: 48_000,
      channelCount: 2,
      frameCount: 4,
    })

    expect(block.sequence).toBe(7)
    expect(block.frames).toHaveLength(2)
    expect(Array.from(block.frames[0]!)).toEqual([0, 0, 0, 0])
    expect(Array.from(block.frames[1]!)).toEqual([0, 0, 0, 0])
    expect(() => assertAudioBlockShape(block)).not.toThrow()
  })

  it('creates constant-filled mono blocks and reports byte length', () => {
    const block = createConstantAudioBlock(0.5, {
      channelCount: 1,
      frameCount: 3,
    })

    expect(Array.from(block.frames[0]!)).toEqual([0.5, 0.5, 0.5])
    expect(totalFrameBytes(block.frames)).toBe(3 * Float32Array.BYTES_PER_ELEMENT)
  })

  it('rejects mismatched channel metadata', () => {
    const block = createSilentAudioBlock({ channelCount: 2, frameCount: 2 })
    block.frames.pop()

    expect(() => assertAudioBlockShape(block)).toThrow(/channelCount/)
  })
})
