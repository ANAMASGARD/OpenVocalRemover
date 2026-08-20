export interface AudioNodePort {
  connect(destination: AudioNodePort): void
}

export interface SignalAnalyserPort extends AudioNodePort {
  readonly fftSize: number
  getFloatTimeDomainData(target: Float32Array<ArrayBuffer>): void
}

export interface AudioContextPort {
  state: AudioContextState
  readonly destination: AudioNodePort
  createMediaElementSource(mediaElement: HTMLMediaElement): AudioNodePort
  createAnalyser(): SignalAnalyserPort
  resume(): Promise<void>
  close(): Promise<void>
}

export type AudioContextFactory = () => AudioContextPort

export type CaptureProbeResult =
  | { status: 'ready'; peakAmplitude: number; windowsObserved: number }
  | { status: 'activation-required' }
  | { status: 'no-signal-observed'; windowsObserved: number }
  | { status: 'unsupported'; reason: string }
  | { status: 'failed'; reason: string }

type CaptureMonitor = {
  readonly analyser: SignalAnalyserPort
}

const MINIMUM_SIGNAL_AMPLITUDE = 0.000_01

async function waitForAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

/**
 * Explicit development probe for the browser feasibility gate. It is not wired
 * into normal playback: claiming a CORS-tainted media element may yield silence
 * and cannot be treated as a safe production bypass without browser evidence.
 */
export class MediaElementCaptureProbe {
  private context: AudioContextPort | undefined
  private readonly monitors = new WeakMap<HTMLMediaElement, CaptureMonitor>()

  constructor(
    private readonly createAudioContext: AudioContextFactory,
    private readonly waitForNextWindow: () => Promise<void> = waitForAnimationFrame,
    private readonly windowCount = 8,
  ) {
    if (!Number.isInteger(windowCount) || windowCount <= 0) {
      throw new Error('windowCount must be a positive integer')
    }
  }

  async activate(): Promise<boolean> {
    const context = this.getContext()
    if (context.state !== 'running') {
      await context.resume()
    }
    return context.state === 'running'
  }

  async probe(mediaElement: HTMLMediaElement): Promise<CaptureProbeResult> {
    const context = this.getContext()
    if (context.state !== 'running') {
      return { status: 'activation-required' }
    }

    let monitor = this.monitors.get(mediaElement)
    if (monitor === undefined) {
      const analyser = context.createAnalyser()
      let source: AudioNodePort
      try {
        source = context.createMediaElementSource(mediaElement)
      } catch {
        return {
          status: 'unsupported',
          reason: 'This media element cannot be routed through Web Audio.',
        }
      }

      try {
        // Raw passthrough is connected first. The analyser has no destination,
        // so it observes the signal without duplicating audible output.
        source.connect(context.destination)
        source.connect(analyser)
      } catch {
        return {
          status: 'failed',
          reason: 'Unable to attach the non-audible signal monitor.',
        }
      }

      monitor = { analyser }
      this.monitors.set(mediaElement, monitor)
    }

    const samples = new Float32Array(monitor.analyser.fftSize)
    for (let index = 0; index < this.windowCount; index += 1) {
      monitor.analyser.getFloatTimeDomainData(samples)
      let peakAmplitude = 0
      for (const sample of samples) {
        peakAmplitude = Math.max(peakAmplitude, Math.abs(sample))
      }
      if (peakAmplitude >= MINIMUM_SIGNAL_AMPLITUDE) {
        return { status: 'ready', peakAmplitude, windowsObserved: index + 1 }
      }
      if (index + 1 < this.windowCount) {
        await this.waitForNextWindow()
      }
    }

    return { status: 'no-signal-observed', windowsObserved: this.windowCount }
  }

  async disposePageContext(): Promise<void> {
    if (this.context !== undefined) {
      await this.context.close()
      this.context = undefined
    }
  }

  private getContext(): AudioContextPort {
    this.context ??= this.createAudioContext()
    return this.context
  }
}

export function createBrowserMediaElementCaptureProbe(): MediaElementCaptureProbe {
  return new MediaElementCaptureProbe(() => new AudioContext())
}
