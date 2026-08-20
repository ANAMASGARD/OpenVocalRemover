import { describe, expect, it } from 'vitest'
import { ProcessingHostCapabilityBroker } from './capability-broker.ts'

describe('processing host capability broker', () => {
  it('claims a capability once for the registering tab', () => {
    const broker = new ProcessingHostCapabilityBroker({ ttlMs: 10_000, maximumPending: 4 })
    broker.register({ tabId: 7, sessionId: 'session-1', capability: 'a'.repeat(64) }, 1_000)

    expect(
      broker.claim({ tabId: 8, sessionId: 'session-1', capability: 'a'.repeat(64) }, 1_001),
    ).toEqual({ ok: false, reason: 'not-found' })
    expect(
      broker.claim({ tabId: 7, sessionId: 'session-1', capability: 'b'.repeat(64) }, 1_002),
    ).toEqual({ ok: false, reason: 'not-found' })
    expect(
      broker.claim({ tabId: 7, sessionId: 'session-1', capability: 'a'.repeat(64) }, 1_003),
    ).toEqual({ ok: true })
    expect(
      broker.claim({ tabId: 7, sessionId: 'session-1', capability: 'a'.repeat(64) }, 1_004),
    ).toEqual({ ok: false, reason: 'not-found' })
  })

  it('expires and revokes capabilities without consuming unrelated entries', () => {
    const broker = new ProcessingHostCapabilityBroker({ ttlMs: 100, maximumPending: 4 })
    broker.register({ tabId: 7, sessionId: 'expired', capability: 'a'.repeat(64) }, 1_000)
    broker.register({ tabId: 7, sessionId: 'active', capability: 'b'.repeat(64) }, 1_050)

    expect(
      broker.claim({ tabId: 7, sessionId: 'expired', capability: 'a'.repeat(64) }, 1_101),
    ).toEqual({ ok: false, reason: 'expired' })
    expect(broker.revoke(7, 'active')).toBe(true)
    expect(
      broker.claim({ tabId: 7, sessionId: 'active', capability: 'b'.repeat(64) }, 1_102),
    ).toEqual({ ok: false, reason: 'not-found' })
  })

  it('keeps a strict maximum pending capability count', () => {
    const broker = new ProcessingHostCapabilityBroker({ ttlMs: 10_000, maximumPending: 1 })
    broker.register({ tabId: 1, sessionId: 'one', capability: 'a'.repeat(64) }, 1_000)

    expect(() =>
      broker.register({ tabId: 1, sessionId: 'two', capability: 'b'.repeat(64) }, 1_001),
    ).toThrow(/maximum pending/)
  })
})
