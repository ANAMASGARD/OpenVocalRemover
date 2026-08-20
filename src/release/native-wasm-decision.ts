export type NativeWasmProfileEvidence = {
  schemaVersion: 1
  modelId: string
  browser: 'firefox'
  browserVersion: string
  modelHopDurationMs: number
  preprocessingP95Ms: number
  inferenceP95Ms: number
  postprocessingP95Ms: number
  missedDeadlineCount: number
}

export type NativeWasmDecision =
  | {
    eligible: false
    decision: 'deferred'
    reason: 'no-approved-model' | 'no-profiler-evidence' | 'profile-model-mismatch'
  }
  | {
    eligible: false
    decision: 'rejected'
    reason: 'inference-bottleneck' | 'no-dsp-deadline-bottleneck'
  }
  | {
    eligible: true
    decision: 'eligible-for-experiment'
    reason: 'profiled-dsp-bottleneck'
  }

function parseProfile(value: unknown): NativeWasmProfileEvidence {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('native Wasm profile must be a plain object')
  }
  const profile = value as Record<string, unknown>
  if (profile.schemaVersion !== 1) throw new Error('native Wasm profile.schemaVersion must be 1')
  for (const key of ['modelId', 'browserVersion']) {
    if (typeof profile[key] !== 'string' || profile[key].trim().length === 0) {
      throw new Error(`native Wasm profile.${key} must be a non-empty string`)
    }
  }
  if (profile.browser !== 'firefox') {
    throw new Error('native Wasm profile.browser must be firefox for the v1 gate')
  }
  for (const key of [
    'modelHopDurationMs',
    'preprocessingP95Ms',
    'inferenceP95Ms',
    'postprocessingP95Ms',
  ]) {
    const metric = profile[key]
    if (typeof metric !== 'number' || !Number.isFinite(metric) || metric <= 0) {
      throw new Error(`native Wasm profile.${key} must be a positive finite number`)
    }
  }
  if (
    typeof profile.missedDeadlineCount !== 'number'
    || !Number.isInteger(profile.missedDeadlineCount)
    || profile.missedDeadlineCount < 0
  ) {
    throw new Error('native Wasm profile.missedDeadlineCount must be a non-negative integer')
  }
  return value as NativeWasmProfileEvidence
}

/** Decides whether the evidence justifies starting, but not shipping, a C++ experiment. */
export function evaluateNativeWasmDecision(
  selectedModelId: string | null,
  profileValue: unknown,
): NativeWasmDecision {
  if (selectedModelId === null) {
    return { eligible: false, decision: 'deferred', reason: 'no-approved-model' }
  }
  if (profileValue === null) {
    return { eligible: false, decision: 'deferred', reason: 'no-profiler-evidence' }
  }
  const profile = parseProfile(profileValue)
  if (profile.modelId !== selectedModelId) {
    return { eligible: false, decision: 'deferred', reason: 'profile-model-mismatch' }
  }

  const dspP95Ms = profile.preprocessingP95Ms + profile.postprocessingP95Ms
  if (profile.inferenceP95Ms >= dspP95Ms) {
    return { eligible: false, decision: 'rejected', reason: 'inference-bottleneck' }
  }
  if (
    profile.missedDeadlineCount === 0
    || dspP95Ms <= profile.modelHopDurationMs / 2
  ) {
    return { eligible: false, decision: 'rejected', reason: 'no-dsp-deadline-bottleneck' }
  }
  return {
    eligible: true,
    decision: 'eligible-for-experiment',
    reason: 'profiled-dsp-bottleneck',
  }
}
