import { describe, expect, it } from 'vitest'
import { ProcessingHostCapabilityBroker } from './capability-broker.ts'
import { createProcessingHostBrokerHandler, parseHostConnectMessage } from './protocol.ts'

describe('processing host protocol', () => {
  it('binds registration and claim to the sender tab', () => {
    const broker = new ProcessingHostCapabilityBroker({ ttlMs: 10_000, maximumPending: 4 })
    const handle = createProcessingHostBrokerHandler(broker, () => 1_000)
    const capability = 'a'.repeat(64)

    expect(
      handle(
        { type: 'register-processing-host', sessionId: 'session-1', capability },
        { tab: { id: 7 } },
      ),
    ).toEqual({ type: 'processing-host-authority', ok: true })
    expect(
      handle(
        { type: 'claim-processing-host', sessionId: 'session-1', capability },
        { tab: { id: 8 } },
      ),
    ).toEqual({ type: 'processing-host-authority', ok: false, reason: 'not-found' })
    expect(
      handle(
        { type: 'claim-processing-host', sessionId: 'session-1', capability },
        { tab: { id: 7 } },
      ),
    ).toEqual({ type: 'processing-host-authority', ok: true })
  })

  it('rejects malformed or tabless authority requests', () => {
    const broker = new ProcessingHostCapabilityBroker({ ttlMs: 10_000, maximumPending: 4 })
    const handle = createProcessingHostBrokerHandler(broker, () => 1_000)
    expect(handle({ type: 'popup-command' }, {})).toBeUndefined()
    expect(handle({ type: 'register-processing-host' }, { tab: { id: 7 } })).toEqual({
      type: 'processing-host-authority',
      ok: false,
      reason: 'invalid-request',
    })
    expect(
      handle(
        { type: 'register-processing-host', sessionId: 'session-1', capability: 'a'.repeat(64) },
        {},
      ),
    ).toEqual({ type: 'processing-host-authority', ok: false, reason: 'missing-tab' })
  })

  it('validates the iframe handshake payload', () => {
    expect(
      parseHostConnectMessage({
        type: 'connect-processing-host',
        sessionId: 'session-1',
        capability: 'a'.repeat(64),
      }),
    ).toEqual({
      type: 'connect-processing-host',
      sessionId: 'session-1',
      capability: 'a'.repeat(64),
    })
    expect(() => parseHostConnectMessage({ type: 'connect-processing-host' })).toThrow(
      /sessionId/,
    )
  })
})
