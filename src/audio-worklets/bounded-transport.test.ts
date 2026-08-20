import { describe, expect, it } from 'vitest'
import { BoundedAudioBlockQueue, RecyclableAudioBufferPool } from './bounded-transport.ts'
import { createAudioBlockFixture } from '../test/audio-fixtures.ts'

describe('bounded audio transport', () => {
  it('keeps blocks ordered and refuses capacity growth', () => {
    const queue = new BoundedAudioBlockQueue(2)
    const first = createAudioBlockFixture({ sequence: 0, startFrame: 0 })
    const second = createAudioBlockFixture({ sequence: 1, startFrame: 128 })
    const third = createAudioBlockFixture({ sequence: 2, startFrame: 256 })

    expect(queue.enqueue(first)).toBe('accepted')
    expect(queue.enqueue(second)).toBe('accepted')
    expect(queue.enqueue(third)).toBe('overflow')
    expect(queue.dequeue()).toBe(first)
    expect(queue.dequeue()).toBe(second)
    expect(queue.dequeue()).toBeUndefined()
  })

  it('rejects stale sessions and discontinuous frames', () => {
    const queue = new BoundedAudioBlockQueue(3)
    expect(queue.enqueue(createAudioBlockFixture({ sequence: 0, startFrame: 0 }))).toBe('accepted')
    expect(
      queue.enqueue(
        createAudioBlockFixture({
          sessionId: 'stale-session',
          sequence: 1,
          startFrame: 128,
        }),
      ),
    ).toBe('discontinuous')
    expect(queue.enqueue(createAudioBlockFixture({ sequence: 1, startFrame: 256 }))).toBe(
      'discontinuous',
    )
  })

  it('preallocates a fixed number of channel buffers and recycles returned ownership', () => {
    const pool = new RecyclableAudioBufferPool({
      blockCount: 2,
      channelCount: 2,
      frameCount: 128,
    })

    const first = pool.acquire()
    const second = pool.acquire()
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect(pool.acquire()).toBeUndefined()

    pool.release(first!.map((channel) => channel.buffer as ArrayBuffer))
    const recycled = pool.acquire()
    expect(recycled).toHaveLength(2)
    expect(recycled![0]).toHaveLength(128)
    expect(() => pool.release([new ArrayBuffer(8)])).toThrow(/channel count/)
  })
})
