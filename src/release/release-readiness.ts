import type { ModelLock } from '../inference/model-gate.ts'

export const FIREFOX_MANUAL_CHECK_NAMES = [
  'temporaryInstall',
  'explicitActivation',
  'disableRestoresOriginal',
  'navigationRestoresOriginal',
  'seekRestoresOriginal',
  'pauseRestoresOriginal',
  'rateChangeRestoresOriginal',
  'videoReplacementRestoresOriginal',
  'workerFailureRestoresOriginal',
  'deadlineMissRestoresOriginal',
  'noUnexpectedNetworkRequests',
  'browserRestart',
] as const

export type FirefoxManualCheckName = typeof FIREFOX_MANUAL_CHECK_NAMES[number]
export type FirefoxManualCheckResult = 'passed' | 'failed' | 'not-run'

export type FirefoxManualEvidence = {
  schemaVersion: 1
  browser: 'firefox'
  browserVersion: string
  operatingSystem: string
  modelId: string
  testMediaDescription: string
  checks: Record<FirefoxManualCheckName, FirefoxManualCheckResult>
}

export type FirefoxReleaseBlocker =
  | 'no-approved-model'
  | 'manual-evidence-missing'
  | 'manual-evidence-model-mismatch'
  | 'manual-evidence-incomplete'

export type FirefoxReleaseReadiness =
  | { ready: true }
  | { ready: false; blockers: FirefoxReleaseBlocker[] }

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }
  return value as Record<string, unknown>
}

function requireSafeDescription(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`)
  }
  if (/\b(?:https?:\/\/|www\.)/iu.test(value)) {
    throw new Error(`${label}.${key} must not contain a URL`)
  }
  return value
}

/** Parses the redacted aggregate evidence committed after a real Firefox run. */
export function parseFirefoxManualEvidence(value: unknown): FirefoxManualEvidence {
  const evidence = requireRecord(value, 'Firefox manual evidence')
  if (evidence.schemaVersion !== 1) {
    throw new Error('Firefox manual evidence.schemaVersion must be 1')
  }
  if (evidence.browser !== 'firefox') {
    throw new Error('Firefox manual evidence.browser must be firefox')
  }

  requireSafeDescription(evidence, 'browserVersion', 'Firefox manual evidence')
  requireSafeDescription(evidence, 'operatingSystem', 'Firefox manual evidence')
  requireSafeDescription(evidence, 'modelId', 'Firefox manual evidence')
  requireSafeDescription(evidence, 'testMediaDescription', 'Firefox manual evidence')

  const checks = requireRecord(evidence.checks, 'Firefox manual evidence.checks')
  const expectedNames = new Set<string>(FIREFOX_MANUAL_CHECK_NAMES)
  for (const name of Object.keys(checks)) {
    if (!expectedNames.has(name)) {
      throw new Error(`Firefox manual evidence.checks.${name} is not recognised`)
    }
  }
  for (const name of FIREFOX_MANUAL_CHECK_NAMES) {
    const result = checks[name]
    if (result !== 'passed' && result !== 'failed' && result !== 'not-run') {
      throw new Error(
        `Firefox manual evidence.checks.${name} must be passed, failed, or not-run`,
      )
    }
  }

  return value as FirefoxManualEvidence
}

export function assessFirefoxReleaseReadiness(
  lock: ModelLock,
  evidence: FirefoxManualEvidence | null,
): FirefoxReleaseReadiness {
  const blockers: FirefoxReleaseBlocker[] = []
  if (lock.selectedModelId === null) blockers.push('no-approved-model')
  if (evidence === null) {
    blockers.push('manual-evidence-missing')
  } else if (lock.selectedModelId !== null && evidence.modelId !== lock.selectedModelId) {
    blockers.push('manual-evidence-model-mismatch')
  } else if (FIREFOX_MANUAL_CHECK_NAMES.some((name) => evidence.checks[name] !== 'passed')) {
    blockers.push('manual-evidence-incomplete')
  }

  return blockers.length === 0 ? { ready: true } : { ready: false, blockers }
}
