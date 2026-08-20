import {
  ProcessingHostCapabilityBroker,
  type CapabilityRegistration,
} from './capability-broker.ts'

export type RegisterProcessingHost = {
  type: 'register-processing-host'
  sessionId: string
  capability: string
}

export type ClaimProcessingHost = {
  type: 'claim-processing-host'
  sessionId: string
  capability: string
}

export type RevokeProcessingHost = {
  type: 'revoke-processing-host'
  sessionId: string
}

export type ProcessingHostAuthorityResponse =
  | { type: 'processing-host-authority'; ok: true }
  | {
      type: 'processing-host-authority'
      ok: false
      reason: 'invalid-request' | 'missing-tab' | 'not-found' | 'expired'
    }

export type HostConnectMessage = {
  type: 'connect-processing-host'
  sessionId: string
  capability: string
}

export type RuntimeSenderLike = { tab?: { id?: number } }

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('message must be a plain object')
  }
  return value as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

function requireCapability(record: Record<string, unknown>): string {
  const capability = requireString(record, 'capability')
  if (!/^[a-f0-9]{64}$/u.test(capability)) {
    throw new Error('capability must be 256-bit lowercase hex')
  }
  return capability
}

export function parseHostConnectMessage(value: unknown): HostConnectMessage {
  const record = asRecord(value)
  if (record.type !== 'connect-processing-host') {
    throw new Error('unsupported processing-host connect message')
  }
  return {
    type: 'connect-processing-host',
    sessionId: requireString(record, 'sessionId'),
    capability: requireCapability(record),
  }
}

function parseAuthorityRequest(
  value: unknown,
): RegisterProcessingHost | ClaimProcessingHost | RevokeProcessingHost | undefined {
  const record = asRecord(value)
  if (
    record.type !== 'register-processing-host'
    && record.type !== 'claim-processing-host'
    && record.type !== 'revoke-processing-host'
  ) {
    return undefined
  }
  const sessionId = requireString(record, 'sessionId')
  if (record.type === 'revoke-processing-host') return { type: record.type, sessionId }
  return { type: record.type, sessionId, capability: requireCapability(record) }
}

export function createProcessingHostBrokerHandler(
  broker: ProcessingHostCapabilityBroker,
  now: () => number,
): (
  value: unknown,
  sender: RuntimeSenderLike,
) => ProcessingHostAuthorityResponse | undefined {
  return (value, sender) => {
    let request: ReturnType<typeof parseAuthorityRequest>
    try {
      request = parseAuthorityRequest(value)
    } catch {
      return { type: 'processing-host-authority', ok: false, reason: 'invalid-request' }
    }
    if (request === undefined) return undefined
    const tabId = sender.tab?.id
    if (tabId === undefined) {
      return { type: 'processing-host-authority', ok: false, reason: 'missing-tab' }
    }
    if (request.type === 'revoke-processing-host') {
      const ok = broker.revoke(tabId, request.sessionId)
      return ok
        ? { type: 'processing-host-authority', ok: true }
        : { type: 'processing-host-authority', ok: false, reason: 'not-found' }
    }
    const authority: CapabilityRegistration = {
      tabId,
      sessionId: request.sessionId,
      capability: request.capability,
    }
    if (request.type === 'register-processing-host') {
      try {
        broker.register(authority, now())
        return { type: 'processing-host-authority', ok: true }
      } catch {
        return { type: 'processing-host-authority', ok: false, reason: 'invalid-request' }
      }
    }
    const result = broker.claim(authority, now())
    return result.ok
      ? { type: 'processing-host-authority', ok: true }
      : { type: 'processing-host-authority', ok: false, reason: result.reason }
  }
}
