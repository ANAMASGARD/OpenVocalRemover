export interface AudioGraphNode {
  connect(destination: AudioGraphNode): void
  disconnect(destination?: AudioGraphNode): void
}

export interface GainParamPort {
  value: number
  cancelScheduledValues(startTime: number): void
  setValueAtTime(value: number, startTime: number): void
  linearRampToValueAtTime(value: number, endTime: number): void
}

export interface GainNodePort extends AudioGraphNode {
  readonly gain: GainParamPort
}

export interface AudioGraphContext {
  readonly currentTime: number
  readonly destination: AudioGraphNode
  audioWorklet: { addModule(moduleUrl: string): Promise<void> }
  createGain(): GainNodePort
  createMediaElementSource(mediaElement: HTMLMediaElement): AudioGraphNode
}

export type WorkletNodeFactory = (context: AudioGraphContext) => AudioGraphNode

export type PrepareAudioGraphOptions = {
  context: AudioGraphContext
  mediaElement: HTMLMediaElement
  moduleUrl: string
  createWorkletNode: WorkletNodeFactory
}

export type PreparedAudioGraphResult =
  | { status: 'ready'; graph: ReversibleAudioGraph }
  | { status: 'failed'; reason: string }

const CROSSFADE_DURATION_SECONDS = 0.02

function rampGain(parameter: GainParamPort, target: number, now: number): void {
  parameter.cancelScheduledValues(now)
  parameter.setValueAtTime(parameter.value, now)
  parameter.linearRampToValueAtTime(target, now + CROSSFADE_DURATION_SECONDS)
}

/** Deep graph boundary: callers can select processed output or fail open only. */
export class ReversibleAudioGraph {
  constructor(
    private readonly context: AudioGraphContext,
    private readonly source: AudioGraphNode,
    private readonly worklet: AudioGraphNode,
    private readonly rawGain: GainNodePort,
    private readonly processedGain: GainNodePort,
  ) {}

  selectProcessed(): void {
    const now = this.context.currentTime
    rampGain(this.rawGain.gain, 0, now)
    rampGain(this.processedGain.gain, 1, now)
  }

  failOpen(): void {
    const now = this.context.currentTime
    rampGain(this.rawGain.gain, 1, now)
    rampGain(this.processedGain.gain, 0, now)
  }

  /** Removes only the processed branch; the claimed media source stays raw-audible. */
  releaseProcessedPath(): void {
    this.failOpen()
    this.source.disconnect(this.worklet)
    this.worklet.disconnect(this.processedGain)
    this.processedGain.disconnect(this.context.destination)
  }
}

export async function prepareReversibleAudioGraph(
  options: PrepareAudioGraphOptions,
): Promise<PreparedAudioGraphResult> {
  try {
    await options.context.audioWorklet.addModule(options.moduleUrl)
  } catch {
    return {
      status: 'failed',
      reason: 'AudioWorklet preparation failed before media capture.',
    }
  }

  const rawGain = options.context.createGain()
  const processedGain = options.context.createGain()
  const worklet = options.createWorkletNode(options.context)
  rawGain.gain.setValueAtTime(1, options.context.currentTime)
  processedGain.gain.setValueAtTime(0, options.context.currentTime)
  rawGain.connect(options.context.destination)
  worklet.connect(processedGain)
  processedGain.connect(options.context.destination)

  let source: AudioGraphNode
  try {
    source = options.context.createMediaElementSource(options.mediaElement)
    source.connect(rawGain)
    source.connect(worklet)
  } catch {
    return {
      status: 'failed',
      reason: 'Media capture failed; the processed route was not selected.',
    }
  }

  return {
    status: 'ready',
    graph: new ReversibleAudioGraph(
      options.context,
      source,
      worklet,
      rawGain,
      processedGain,
    ),
  }
}
