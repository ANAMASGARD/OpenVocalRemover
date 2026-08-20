export type ModelCandidateStatus = 'research-only' | 'blocked' | 'approved'

export type TensorDescriptor = {
  name: string
  dataType: string
  shape: number[]
}

export type BrowserBenchmark = {
  browser: 'chrome' | 'firefox'
  browserVersion: string
  operatingSystem: string
  cpu: string
  ortBackend: 'wasm-simd' | 'wasm'
  hopDurationMs: number
  p95InferenceMs: number
  peakMemoryMiB: number
  sustainedQueueGrowth: boolean
}

export type ModelApproval = {
  artifactPath: string
  artifactSha256: string
  artifactByteSize: number
  measuredPackageByteSize: number
  weightLicense: string
  attributionPath: string
  trainingDataProvenance: string
  exportSourceUrl: string
  exportRevision: string
  causal: boolean
  sampleRateHz: number
  channelCount: 1 | 2
  frameCount: number
  hopFrameCount: number
  algorithmicLatencyFrameCount: number
  inputTensors: TensorDescriptor[]
  outputTensors: TensorDescriptor[]
  outputSemantics: string
  browserBenchmarks: BrowserBenchmark[]
  qualityEvidence: {
    licensedDataset: string
    objectiveReportPath: string
    listeningReportPath: string
  }
}

export type ModelCandidate = {
  id: string
  status: ModelCandidateStatus
  architecture: string
  sourceUrl: string
  sourceRevision: string
  decisionReason: string
  approval?: ModelApproval
}

export type ModelLock = {
  schemaVersion: 1
  selectedModelId: string | null
  candidates: ModelCandidate[]
}

const MAXIMUM_PACKAGE_BYTE_SIZE = 150 * 1024 * 1024

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object`)
  }
  return value as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`)
  }
  return value
}

function requirePositiveNumber(record: Record<string, unknown>, key: string, label: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}.${key} must be a positive finite number`)
  }
  return value
}

function requirePositiveInteger(record: Record<string, unknown>, key: string, label: string): number {
  const value = requirePositiveNumber(record, key, label)
  if (!Number.isInteger(value)) throw new Error(`${label}.${key} must be an integer`)
  return value
}

function validateTensor(value: unknown, label: string): void {
  const tensor = asRecord(value, label)
  requireString(tensor, 'name', label)
  requireString(tensor, 'dataType', label)
  if (!Array.isArray(tensor.shape) || tensor.shape.length === 0) {
    throw new Error(`${label}.shape must contain dimensions`)
  }
  for (const dimension of tensor.shape) {
    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error(`${label}.shape dimensions must be positive integers`)
    }
  }
}

function validateApproval(value: unknown, candidateId: string): void {
  const label = `candidate ${candidateId} approval`
  const approval = asRecord(value, label)
  const artifactPath = requireString(approval, 'artifactPath', label)
  const attributionPath = requireString(approval, 'attributionPath', label)
  if (!artifactPath.startsWith(`public/models/${candidateId}/`)) {
    throw new Error(`${label}.artifactPath must be local to public/models/${candidateId}`)
  }
  if (!attributionPath.startsWith(`public/models/${candidateId}/`)) {
    throw new Error(`${label}.attributionPath must be local to public/models/${candidateId}`)
  }
  if (!/^[a-f0-9]{64}$/u.test(requireString(approval, 'artifactSha256', label))) {
    throw new Error(`${label}.artifactSha256 must be lowercase SHA-256`)
  }
  const artifactByteSize = requirePositiveInteger(approval, 'artifactByteSize', label)
  const packageByteSize = requirePositiveInteger(approval, 'measuredPackageByteSize', label)
  if (artifactByteSize > packageByteSize) throw new Error(`${label} package is smaller than its model`)
  if (packageByteSize > MAXIMUM_PACKAGE_BYTE_SIZE) {
    throw new Error(`${label} measured package must not exceed 150 MiB`)
  }
  for (const key of [
    'weightLicense', 'trainingDataProvenance', 'exportSourceUrl', 'exportRevision', 'outputSemantics',
  ]) requireString(approval, key, label)
  if (approval.causal !== true) throw new Error(`${label}.causal must be true`)
  const sampleRateHz = requirePositiveInteger(approval, 'sampleRateHz', label)
  if (approval.channelCount !== 1 && approval.channelCount !== 2) {
    throw new Error(`${label}.channelCount must be 1 or 2`)
  }
  const frameCount = requirePositiveInteger(approval, 'frameCount', label)
  const hopFrameCount = requirePositiveInteger(approval, 'hopFrameCount', label)
  const latencyFrameCount = requirePositiveInteger(approval, 'algorithmicLatencyFrameCount', label)
  if (hopFrameCount > frameCount) throw new Error(`${label}.hopFrameCount exceeds frameCount`)
  if (latencyFrameCount / sampleRateHz * 1_000 > 100) {
    throw new Error(`${label} algorithmic latency exceeds 100 ms`)
  }
  for (const tensorKey of ['inputTensors', 'outputTensors'] as const) {
    const tensors = approval[tensorKey]
    if (!Array.isArray(tensors) || tensors.length === 0) {
      throw new Error(`${label}.${tensorKey} must not be empty`)
    }
    tensors.forEach((tensor, index) => validateTensor(tensor, `${label}.${tensorKey}[${index}]`))
  }
  if (!Array.isArray(approval.browserBenchmarks)) {
    throw new Error(`${label}.browserBenchmarks must be an array`)
  }
  const seenBrowsers = new Set<string>()
  for (const [index, value] of approval.browserBenchmarks.entries()) {
    const benchmarkLabel = `${label}.browserBenchmarks[${index}]`
    const benchmark = asRecord(value, benchmarkLabel)
    if (benchmark.browser !== 'chrome' && benchmark.browser !== 'firefox') {
      throw new Error(`${benchmarkLabel}.browser must be chrome or firefox`)
    }
    seenBrowsers.add(benchmark.browser)
    for (const key of ['browserVersion', 'operatingSystem', 'cpu']) {
      requireString(benchmark, key, benchmarkLabel)
    }
    if (benchmark.ortBackend !== 'wasm-simd' && benchmark.ortBackend !== 'wasm') {
      throw new Error(`${benchmarkLabel}.ortBackend must be Wasm`)
    }
    const hopDurationMs = requirePositiveNumber(benchmark, 'hopDurationMs', benchmarkLabel)
    const p95InferenceMs = requirePositiveNumber(benchmark, 'p95InferenceMs', benchmarkLabel)
    requirePositiveNumber(benchmark, 'peakMemoryMiB', benchmarkLabel)
    if (p95InferenceMs > hopDurationMs / 2) {
      throw new Error(`${benchmarkLabel} p95 must be no more than half the hop duration`)
    }
    if (benchmark.sustainedQueueGrowth !== false) {
      throw new Error(`${benchmarkLabel} must show no sustained queue growth`)
    }
  }
  if (!seenBrowsers.has('chrome') || !seenBrowsers.has('firefox') || seenBrowsers.size !== 2) {
    throw new Error(`${label} requires one Chrome and one Firefox benchmark`)
  }
  const quality = asRecord(approval.qualityEvidence, `${label}.qualityEvidence`)
  for (const key of ['licensedDataset', 'objectiveReportPath', 'listeningReportPath']) {
    requireString(quality, key, `${label}.qualityEvidence`)
  }
}

export function validateModelLock(value: unknown): ModelLock {
  const lock = asRecord(value, 'model lock')
  if (lock.schemaVersion !== 1) throw new Error('model lock schemaVersion must be 1')
  if (lock.selectedModelId !== null && typeof lock.selectedModelId !== 'string') {
    throw new Error('model lock selectedModelId must be a string or null')
  }
  if (!Array.isArray(lock.candidates) || lock.candidates.length === 0) {
    throw new Error('model lock candidates must not be empty')
  }

  const ids = new Set<string>()
  const approvedIds: string[] = []
  for (const [index, value] of lock.candidates.entries()) {
    const label = `model lock candidates[${index}]`
    const candidate = asRecord(value, label)
    const id = requireString(candidate, 'id', label)
    if (ids.has(id)) throw new Error(`duplicate model candidate ${id}`)
    ids.add(id)
    const status = candidate.status
    if (status !== 'research-only' && status !== 'blocked' && status !== 'approved') {
      throw new Error(`${label}.status is invalid`)
    }
    for (const key of ['architecture', 'sourceUrl', 'sourceRevision', 'decisionReason']) {
      requireString(candidate, key, label)
    }
    if (status === 'approved') {
      if (candidate.approval === undefined) throw new Error(`${id} requires complete approval evidence`)
      validateApproval(candidate.approval, id)
      approvedIds.push(id)
    }
  }

  if (lock.selectedModelId === null) {
    if (approvedIds.length !== 0) throw new Error('an approved model must be selected')
  } else if (approvedIds.length !== 1 || approvedIds[0] !== lock.selectedModelId) {
    throw new Error('selectedModelId must identify the one approved model')
  }
  return value as ModelLock
}
