import { describe, expect, it } from 'vitest'
import modelLockJson from '../../models/model-lock.json'
import { validateModelLock, type ModelLock } from '../inference/model-gate.ts'
import {
  assessFirefoxReleaseReadiness,
  parseFirefoxManualEvidence,
} from './release-readiness.ts'

const approvedLock = {
  schemaVersion: 1,
  selectedModelId: 'causal-fixture',
  candidates: [],
} as unknown as ModelLock

const completeManualEvidence = {
  schemaVersion: 1,
  browser: 'firefox',
  browserVersion: '153.0.3',
  operatingSystem: 'Linux',
  modelId: 'causal-fixture',
  testMediaDescription: 'Permitted stereo music fixture',
  checks: {
    temporaryInstall: 'passed',
    explicitActivation: 'passed',
    disableRestoresOriginal: 'passed',
    navigationRestoresOriginal: 'passed',
    seekRestoresOriginal: 'passed',
    pauseRestoresOriginal: 'passed',
    rateChangeRestoresOriginal: 'passed',
    videoReplacementRestoresOriginal: 'passed',
    workerFailureRestoresOriginal: 'passed',
    deadlineMissRestoresOriginal: 'passed',
    noUnexpectedNetworkRequests: 'passed',
    browserRestart: 'passed',
  },
} as const

describe('Firefox release readiness', () => {
  it('keeps the current checkout blocked instead of treating scaffold checks as release proof', () => {
    const currentLock = validateModelLock(modelLockJson)

    expect(assessFirefoxReleaseReadiness(currentLock, null)).toEqual({
      ready: false,
      blockers: ['no-approved-model', 'manual-evidence-missing'],
    })
  })

  it('stays blocked when no causal model is approved', () => {
    const lock: ModelLock = {
      schemaVersion: 1,
      selectedModelId: null,
      candidates: [],
    }

    expect(assessFirefoxReleaseReadiness(lock, null)).toEqual({
      ready: false,
      blockers: ['no-approved-model', 'manual-evidence-missing'],
    })
  })

  it('requires every fail-open and privacy check to pass for the selected model', () => {
    const evidence = parseFirefoxManualEvidence({
      ...completeManualEvidence,
      checks: {
        ...completeManualEvidence.checks,
        seekRestoresOriginal: 'not-run',
      },
    })

    expect(assessFirefoxReleaseReadiness(approvedLock, evidence)).toEqual({
      ready: false,
      blockers: ['manual-evidence-incomplete'],
    })
  })

  it('rejects evidence recorded for a different model', () => {
    const evidence = parseFirefoxManualEvidence({
      ...completeManualEvidence,
      modelId: 'other-model',
    })

    expect(assessFirefoxReleaseReadiness(approvedLock, evidence)).toEqual({
      ready: false,
      blockers: ['manual-evidence-model-mismatch'],
    })
  })

  it('reports ready only when an approved model and complete Firefox evidence agree', () => {
    const evidence = parseFirefoxManualEvidence(completeManualEvidence)

    expect(assessFirefoxReleaseReadiness(approvedLock, evidence)).toEqual({ ready: true })
  })

  it('rejects malformed or privacy-unsafe evidence', () => {
    expect(() => parseFirefoxManualEvidence({
      ...completeManualEvidence,
      testMediaDescription: 'https://www.youtube.com/watch?v=private-id',
    })).toThrow(/must not contain a URL/)

    expect(() => parseFirefoxManualEvidence({
      ...completeManualEvidence,
      checks: {
        ...completeManualEvidence.checks,
        workerFailureRestoresOriginal: 'yes',
      },
    })).toThrow(/workerFailureRestoresOriginal/)
  })
})
