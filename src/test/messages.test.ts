import { describe, expect, it } from 'vitest'
import {
  assertRecord,
  isRecord,
  requireBooleanField,
  requireNumberField,
  requireStringField,
  requireTypeField,
} from './messages.ts'

describe('message payload helpers', () => {
  it('accepts plain objects and rejects arrays or primitives', () => {
    expect(isRecord({ type: 'ready' })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
    expect(() => assertRecord('nope')).toThrow(/plain object/)
  })

  it('requires a matching discriminated type field', () => {
    expect(requireTypeField({ type: 'dispose' }, 'dispose')).toEqual({ type: 'dispose' })
    expect(() => requireTypeField({ type: 'process' }, 'dispose')).toThrow(/dispose/)
  })

  it('extracts typed fields or throws on malformed payloads', () => {
    const payload = {
      type: 'failure',
      operation: 'initialise',
      message: 'model missing',
      sequence: 3,
      fatal: true,
    }

    expect(requireStringField(payload, 'operation')).toBe('initialise')
    expect(requireNumberField(payload, 'sequence')).toBe(3)
    expect(requireBooleanField(payload, 'fatal')).toBe(true)
    expect(() => requireNumberField(payload, 'message')).toThrow(/finite number/)
  })
})
