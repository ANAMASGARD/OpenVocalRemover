import ortMjsAssetUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasmAssetUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import type { SelectedModel, ModelSelection } from './runtime-model.ts'
import { sourceModelPathToRuntimePath } from './runtime-model.ts'

export type OrtWasmConfiguration = {
  numThreads: 1
  proxy: false
  simd: true
  wasmPaths: { mjs: string; wasm: string }
}

export type OrtSessionLike = {
  readonly inputNames: readonly string[]
  readonly outputNames: readonly string[]
  readonly inputMetadata: readonly OrtValueMetadata[]
  readonly outputMetadata: readonly OrtValueMetadata[]
  run(feeds: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>
  release(): Promise<void>
}

export type OrtValueMetadata =
  | { readonly name: string; readonly isTensor: false }
  | {
      readonly name: string
      readonly isTensor: true
      readonly type: string
      readonly shape: ReadonlyArray<number | string>
    }

export type OrtBindings = {
  configureWasm(configuration: OrtWasmConfiguration): void
  createSession(
    modelUrl: string,
    options: {
      executionProviders: ['wasm']
      executionMode: 'sequential'
      graphOptimizationLevel: 'all'
    },
  ): Promise<OrtSessionLike>
}

export type OrtWasmAssetLocations = {
  workerLocationHref: string
  mjsAssetUrl: string
  wasmAssetUrl: string
}

export class OrtRuntimeError extends Error {
  constructor(
    readonly code: 'unsupported-origin' | 'runtime-initialisation-failed' | 'model-interface-mismatch',
  ) {
    super(code)
    this.name = 'OrtRuntimeError'
  }
}

export type LocalModelSession = {
  readonly modelId: string
  readonly backend: 'wasm-simd'
  release(): Promise<void>
}

function extensionUrl(relativeOrAbsolutePath: string, workerLocationHref: string): string {
  const workerUrl = new URL(workerLocationHref)
  if (workerUrl.protocol !== 'chrome-extension:' && workerUrl.protocol !== 'moz-extension:') {
    throw new OrtRuntimeError('unsupported-origin')
  }
  const url = new URL(relativeOrAbsolutePath, workerUrl)
  if (url.protocol !== workerUrl.protocol || url.host !== workerUrl.host) {
    throw new OrtRuntimeError('unsupported-origin')
  }
  return url.href
}

function interfaceMatches(
  actualNames: readonly string[],
  actualMetadata: readonly OrtValueMetadata[],
  expected: readonly { name: string; dataType: string; shape: number[] }[],
): boolean {
  if (actualNames.length !== expected.length || actualMetadata.length !== expected.length) return false
  const expectedByName = new Map(expected.map((tensor) => [tensor.name, tensor]))
  if (expectedByName.size !== expected.length) return false
  return actualNames.every((name) => {
    const descriptor = expectedByName.get(name)
    const metadata = actualMetadata.find((entry) => entry.name === name)
    return descriptor !== undefined
      && metadata?.isTensor === true
      && metadata.type === descriptor.dataType
      && metadata.shape.length === descriptor.shape.length
      && metadata.shape.every((dimension, index) => dimension === descriptor.shape[index])
  })
}

class LocalModelSessionImpl implements LocalModelSession {
  readonly backend = 'wasm-simd' as const
  private released = false

  constructor(readonly modelId: string, private readonly session: OrtSessionLike) {}

  async release(): Promise<void> {
    if (this.released) return
    this.released = true
    await this.session.release()
  }
}

export class OrtWasmSessionFactory {
  private configured = false

  constructor(
    private readonly bindings: OrtBindings,
    private readonly assets: OrtWasmAssetLocations,
  ) {}

  async create(model: SelectedModel): Promise<LocalModelSession> {
    try {
      if (!this.configured) {
        this.bindings.configureWasm({
          numThreads: 1,
          proxy: false,
          simd: true,
          wasmPaths: {
            mjs: extensionUrl(this.assets.mjsAssetUrl, this.assets.workerLocationHref),
            wasm: extensionUrl(this.assets.wasmAssetUrl, this.assets.workerLocationHref),
          },
        })
        this.configured = true
      }
      const runtimeModelPath = sourceModelPathToRuntimePath(model.approval.artifactPath)
      const session = await this.bindings.createSession(
        extensionUrl(`/${runtimeModelPath}`, this.assets.workerLocationHref),
        {
          executionProviders: ['wasm'],
          executionMode: 'sequential',
          graphOptimizationLevel: 'all',
        },
      )
      if (
        !interfaceMatches(session.inputNames, session.inputMetadata, model.approval.inputTensors)
        || !interfaceMatches(session.outputNames, session.outputMetadata, model.approval.outputTensors)
      ) {
        await session.release()
        throw new OrtRuntimeError('model-interface-mismatch')
      }
      return new LocalModelSessionImpl(model.id, session)
    } catch (error) {
      if (error instanceof OrtRuntimeError) throw error
      throw new OrtRuntimeError('runtime-initialisation-failed')
    }
  }
}

export async function loadProductionOrtFactory(): Promise<OrtWasmSessionFactory> {
  const ort = await import('onnxruntime-web/wasm')
  const bindings: OrtBindings = {
    configureWasm(configuration) {
      ort.env.wasm.numThreads = configuration.numThreads
      ort.env.wasm.proxy = configuration.proxy
      ort.env.wasm.simd = configuration.simd
      ort.env.wasm.wasmPaths = configuration.wasmPaths
    },
    async createSession(modelUrl, options) {
      const session = await ort.InferenceSession.create(modelUrl, options)
      return session as unknown as OrtSessionLike
    },
  }
  return new OrtWasmSessionFactory(bindings, {
    workerLocationHref: self.location.href,
    mjsAssetUrl: ortMjsAssetUrl,
    wasmAssetUrl: ortWasmAssetUrl,
  })
}

export type OpenSelectedModelResult =
  | { available: false; reason: 'no-approved-model' }
  | { available: true; session: LocalModelSession }

export async function openSelectedModel(
  selection: ModelSelection,
  loadFactory: () => Promise<OrtWasmSessionFactory> = loadProductionOrtFactory,
): Promise<OpenSelectedModelResult> {
  if (!selection.available) return selection
  try {
    const factory = await loadFactory()
    return { available: true, session: await factory.create(selection.model) }
  } catch (error) {
    if (error instanceof OrtRuntimeError) throw error
    throw new OrtRuntimeError('runtime-initialisation-failed')
  }
}
