import { describe, expect, it } from 'vitest'
import { createAudioBlockFixture } from '../test/audio-fixtures.ts'
import { RealtimePlaybackScheduler } from './realtime-scheduler.ts'

function scheduler() {
  return new RealtimePlaybackScheduler({
    sessionId: 'session-1',
    channelCount: 2,
    frameCount: 128,
    capacityBlockCount: 3,
    startupBlockCount: 2,
  })
}

function block(options: Parameters<typeof createAudioBlockFixture>[0] = {}) {
  return createAudioBlockFixture({ sessionId: 'session-1', ...options })
}

describe('realtime playback scheduler', () => {
  it('requires the startup watermark and dequeues exact frame order', () => {
    const subject = scheduler()
    expect(subject.accept(block({ sequence: 0, startFrame: 0 }), 1)).toEqual({
      type: 'accepted', ready: false,
    })
    expect(subject.take(1)).toEqual({ type: 'warming' })
    expect(subject.accept(block({ sequence: 1, startFrame: 128 }), 1)).toEqual({
      type: 'accepted', ready: true,
    })
    expect(subject.take(1)).toMatchObject({ type: 'block', block: { sequence: 0 } })
    expect(subject.take(1)).toMatchObject({ type: 'block', block: { sequence: 1 } })
  })

  it('latches late, stale, gapped, and overflowing output as terminal faults', () => {
    const late = scheduler()
    expect(late.accept(block({ capturedAtMs: 0, deadlineAtMs: 10 }), 10)).toMatchObject({
      type: 'fault', reason: 'deadline-miss',
    })

    const stale = scheduler()
    expect(stale.accept(block({ sessionId: 'old' }), 1)).toMatchObject({
      type: 'fault', reason: 'stale-session',
    })

    const gap = scheduler()
    expect(gap.accept(block({ sequence: 1, startFrame: 128 }), 1)).toMatchObject({
      type: 'fault', reason: 'discontinuous-block',
    })

    const overflow = scheduler()
    for (let sequence = 0; sequence < 3; sequence += 1) {
      expect(overflow.accept(block({
        sequence, startFrame: sequence * 128,
      }), 1).type).toBe('accepted')
    }
    expect(overflow.accept(block({ sequence: 3, startFrame: 384 }), 1)).toMatchObject({
      type: 'fault', reason: 'playback-overflow',
    })
  })

  it('fails before silence when ready playback underflows or expires', () => {
    const underflow = scheduler()
    underflow.accept(block({ sequence: 0, startFrame: 0 }), 1)
    underflow.accept(block({ sequence: 1, startFrame: 128 }), 1)
    underflow.take(1)
    underflow.take(1)
    expect(underflow.take(1)).toMatchObject({ type: 'fault', reason: 'playback-underflow' })

    const expired = scheduler()
    expired.accept(block({ sequence: 0, startFrame: 0, capturedAtMs: 0, deadlineAtMs: 20 }), 1)
    expired.accept(block({ sequence: 1, startFrame: 128, capturedAtMs: 0, deadlineAtMs: 20 }), 1)
    expect(expired.take(20)).toMatchObject({ type: 'fault', reason: 'deadline-miss' })
  })

  it('returns every queued block exactly once for bounded recycling after a fault', () => {
    const subject = scheduler()
    subject.accept(block({ sequence: 0, startFrame: 0 }), 1)
    subject.accept(block({ sequence: 1, startFrame: 128 }), 1)
    const drained = subject.fail('worker-failure')
    expect(drained.map(({ sequence }) => sequence)).toEqual([0, 1])
    expect(subject.fail('worker-failure')).toEqual([])
    expect(subject.take(1)).toMatchObject({ type: 'fault', reason: 'worker-failure' })
  })
})
