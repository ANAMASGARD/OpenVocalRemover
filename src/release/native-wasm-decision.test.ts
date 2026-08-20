import { describe, expect, it } from 'vitest'
import { evaluateNativeWasmDecision } from './native-wasm-decision.ts'

const dspBottleneckProfile = {
  schemaVersion: 1,
  modelId: 'causal-fixture',
  browser: 'firefox',
  browserVersion: '153.0.3',
  modelHopDurationMs: 20,
  preprocessingP95Ms: 7,
  inferenceP95Ms: 3,
  postprocessingP95Ms: 5,
  missedDeadlineCount: 4,
} as const

describe('optional native Wasm decision', () => {
  it('defers native code while no production model is approved', () => {
    expect(evaluateNativeWasmDecision(null, null)).toEqual({
      eligible: false,
      decision: 'deferred',
      reason: 'no-approved-model',
    })
  })

  it('requires a profile for the selected model', () => {
    expect(evaluateNativeWasmDecision('causal-fixture', null)).toEqual({
      eligible: false,
      decision: 'deferred',
      reason: 'no-profiler-evidence',
    })
    expect(evaluateNativeWasmDecision('causal-fixture', {
      ...dspBottleneckProfile,
      modelId: 'other-model',
    })).toEqual({
      eligible: false,
      decision: 'deferred',
      reason: 'profile-model-mismatch',
    })
  })

  it('rejects C++ when inference is the measured bottleneck', () => {
    expect(evaluateNativeWasmDecision('causal-fixture', {
      ...dspBottleneckProfile,
      preprocessingP95Ms: 2,
      inferenceP95Ms: 15,
      postprocessingP95Ms: 2,
    })).toEqual({
      eligible: false,
      decision: 'rejected',
      reason: 'inference-bottleneck',
    })
  })

  it('rejects C++ when the profile shows no deadline pressure', () => {
    expect(evaluateNativeWasmDecision('causal-fixture', {
      ...dspBottleneckProfile,
      missedDeadlineCount: 0,
    })).toEqual({
      eligible: false,
      decision: 'rejected',
      reason: 'no-dsp-deadline-bottleneck',
    })
  })

  it('allows a native experiment only for a measured DSP deadline bottleneck', () => {
    expect(evaluateNativeWasmDecision('causal-fixture', dspBottleneckProfile)).toEqual({
      eligible: true,
      decision: 'eligible-for-experiment',
      reason: 'profiled-dsp-bottleneck',
    })
  })

  it('rejects malformed or non-Firefox profile evidence', () => {
    expect(() => evaluateNativeWasmDecision('causal-fixture', {
      ...dspBottleneckProfile,
      browser: 'chrome',
    })).toThrow(/browser/)
    expect(() => evaluateNativeWasmDecision('causal-fixture', {
      ...dspBottleneckProfile,
      preprocessingP95Ms: -1,
    })).toThrow(/preprocessingP95Ms/)
  })
})
