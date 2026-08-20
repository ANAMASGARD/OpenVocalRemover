export type CapabilityRegistration = {
  tabId: number
  sessionId: string
  capability: string
}

export type CapabilityClaim = CapabilityRegistration

export type CapabilityClaimResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'expired' }

type PendingCapability = CapabilityRegistration & { expiresAtMs: number }

export type CapabilityBrokerConfiguration = {
  ttlMs: number
  maximumPending: number
}

function keyFor(tabId: number, sessionId: string): string {
  return `${tabId}:${sessionId}`
}

function assertRegistration(value: CapabilityRegistration): void {
  if (!Number.isInteger(value.tabId) || value.tabId < 0) {
    throw new Error('tabId must be a non-negative integer')
  }
  if (value.sessionId.trim().length === 0) {
    throw new Error('sessionId must not be empty')
  }
  if (!/^[a-f0-9]{64}$/u.test(value.capability)) {
    throw new Error('capability must contain 256 bits encoded as lowercase hex')
  }
}

/** In-memory, one-shot authority broker. Nothing is persisted across restarts. */
export class ProcessingHostCapabilityBroker {
  private readonly pending = new Map<string, PendingCapability>()

  constructor(private readonly configuration: CapabilityBrokerConfiguration) {
    if (!Number.isInteger(configuration.ttlMs) || configuration.ttlMs <= 0) {
      throw new Error('ttlMs must be a positive integer')
    }
    if (!Number.isInteger(configuration.maximumPending) || configuration.maximumPending <= 0) {
      throw new Error('maximumPending must be a positive integer')
    }
  }

  register(registration: CapabilityRegistration, nowMs: number): void {
    assertRegistration(registration)
    this.removeExpired(nowMs)
    const key = keyFor(registration.tabId, registration.sessionId)
    if (!this.pending.has(key) && this.pending.size >= this.configuration.maximumPending) {
      throw new Error('maximum pending processing-host capabilities reached')
    }
    this.pending.set(key, {
      ...registration,
      expiresAtMs: nowMs + this.configuration.ttlMs,
    })
  }

  claim(claim: CapabilityClaim, nowMs: number): CapabilityClaimResult {
    assertRegistration(claim)
    const key = keyFor(claim.tabId, claim.sessionId)
    const pending = this.pending.get(key)
    if (pending === undefined || pending.capability !== claim.capability) {
      return { ok: false, reason: 'not-found' }
    }
    if (nowMs > pending.expiresAtMs) {
      this.pending.delete(key)
      return { ok: false, reason: 'expired' }
    }
    this.pending.delete(key)
    return { ok: true }
  }

  revoke(tabId: number, sessionId: string): boolean {
    return this.pending.delete(keyFor(tabId, sessionId))
  }

  private removeExpired(nowMs: number): void {
    for (const [key, pending] of this.pending) {
      if (nowMs > pending.expiresAtMs) this.pending.delete(key)
    }
  }
}
