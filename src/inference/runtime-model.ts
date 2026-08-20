import {
  validateModelLock,
  type ModelApproval,
  type ModelCandidate,
  type ModelLock,
} from './model-gate.ts'

export type SelectedModel = {
  id: string
  approval: ModelApproval
}

export type ModelSelection =
  | { available: false; reason: 'no-approved-model' }
  | { available: true; model: SelectedModel }

export function resolveSelectedModel(value: unknown): ModelSelection {
  const lock: ModelLock = validateModelLock(value)
  if (lock.selectedModelId === null) {
    return { available: false, reason: 'no-approved-model' }
  }

  const candidate: ModelCandidate | undefined = lock.candidates.find(
    ({ id }) => id === lock.selectedModelId,
  )
  if (candidate?.status !== 'approved' || candidate.approval === undefined) {
    // validateModelLock already prevents this; retain a local invariant so this
    // function remains safe if the validator changes later.
    throw new Error('selected model does not contain approval evidence')
  }
  return { available: true, model: { id: candidate.id, approval: candidate.approval } }
}

/** Converts a validated Vite public source path to its extension runtime path. */
export function sourceModelPathToRuntimePath(sourcePath: string): string {
  const prefix = 'public/models/'
  const modelPath = sourcePath.slice(prefix.length)
  const segments = modelPath.split('/')
  if (
    !sourcePath.startsWith(prefix)
    || modelPath.length === 0
    || !/^[A-Za-z0-9._/-]+$/u.test(modelPath)
    || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('model artifact must be under public/models/')
  }
  return sourcePath.slice('public/'.length)
}
