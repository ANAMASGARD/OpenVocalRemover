import { describe, expect, it } from 'vitest'
import { EchoTransport } from './transport-echo.ts'
import { createAudioBlockFixture } from '../test/audio-fixtures.ts'

describe('processing-host echo transport probe', () => {
  it('preserves samples, sequence, and transferable ownership', () => {
    const transport = new EchoTransport('session-1')
    const block = createAudioBlockFixture({ sessionId: 'session-1' })

    const result = transport.accept({ type: 'captured', block })
    expect(result).toMatchObject({ type: 'processed', block })
    if (result.type !== 'processed') throw new Error('echo failed')
    expect(result.transfer).toEqual(block.frames.map((channel) => channel.buffer))
  })

  it('rejects stale sessions, malformed payloads, and sequence gaps', () => {
    const transport = new EchoTransport('session-1')
    expect(
      transport.accept({
        type: 'captured',
        block: createAudioBlockFixture({ sessionId: 'stale' }),
      }),
    ).toEqual({ type: 'rejected', reason: 'stale-session' })
    expect(transport.accept({ type: 'captured', block: { sequence: 0 } })).toEqual({
      type: 'rejected',
      reason: 'invalid-block',
    })

    transport.accept({ type: 'captured', block: createAudioBlockFixture({ sessionId: 'session-1' }) })
    expect(
      transport.accept({
        type: 'captured',
        block: createAudioBlockFixture({ sessionId: 'session-1', sequence: 2, startFrame: 256 }),
      }),
    ).toEqual({ type: 'rejected', reason: 'discontinuous' })
  })
})
