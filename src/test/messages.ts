/** Lightweight validators for cross-context message payloads in tests and adapters. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function assertRecord(
  value: unknown,
  label = 'message',
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be a plain object`)
  }
}

export function requireTypeField(
  value: unknown,
  expectedType: string,
  label = 'message',
): Record<string, unknown> {
  assertRecord(value, label)
  if (value.type !== expectedType) {
    throw new Error(
      `Expected ${label}.type to be ${JSON.stringify(expectedType)}, received ${JSON.stringify(value.type)}`,
    )
  }

  return value
}

export function requireStringField(
  record: Record<string, unknown>,
  key: string,
  label = 'message',
): string {
  const value = record[key]
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label}.${key} to be a string`)
  }

  return value
}

export function requireNumberField(
  record: Record<string, unknown>,
  key: string,
  label = 'message',
): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected ${label}.${key} to be a finite number`)
  }

  return value
}

export function requireBooleanField(
  record: Record<string, unknown>,
  key: string,
  label = 'message',
): boolean {
  const value = record[key]
  if (typeof value !== 'boolean') {
    throw new Error(`Expected ${label}.${key} to be a boolean`)
  }

  return value
}
