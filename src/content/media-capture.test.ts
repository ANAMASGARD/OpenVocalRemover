import { describe, expect, it, vi } from 'vitest'
import {
  MediaElementCaptureProbe,
  type AudioContextFactory,
  type AudioContextPort,
  type AudioNodePort,
  type SignalAnalyserPort,
} from './media-capture.ts'

class FakeNode implements AudioNodePort {
  readonly connections: AudioNodePort[] = []
  failFor: AudioNodePort | undefined

  connect(destination: AudioNodePort): void {
    if (destination === this.failFor) {
      throw new Error('connection failed')
    }
    this.connections.push(destination)
  }
}

class FakeAnalyser extends FakeNode implements SignalAnalyserPort {
  readonly fftSize = 32
  readonly windows: Float32Array[] = []

  getFloatTimeDomainData(target: Float32Array<ArrayBuffer>): void {
    target.set(this.windows.shift() ?? new Float32Array(target.length))
  }
}

class FakeAudioContext implements AudioContextPort {
  readonly destination = new FakeNode()
  readonly sources: FakeNode[] = []
  readonly analysers: FakeAnalyser[] = []
  readonly createMediaElementSource = vi.fn(() => {
    const source = new FakeNode()
    this.sources.push(source)
    return source
  })
  readonly createAnalyser = vi.fn(() => {
    const analyser = new FakeAnalyser()
    this.analysers.push(analyser)
    return analyser
  })
  readonly resume = vi.fn(async () => {
    this.state = 'running'
  })
  readonly close = vi.fn(async () => undefined)

  constructor(public state: AudioContextState = 'running') {}
}

function factoryFor(context: FakeAudioContext): AudioContextFactory {
  return vi.fn(() => context)
}

describe('media element capture feasibility probe', () => {
  it('requires a YouTube-page activation before claiming the media element', async () => {
    const context = new FakeAudioContext('suspended')
    const probe = new MediaElementCaptureProbe(factoryFor(context), async () => undefined)

    await expect(probe.probe({} as HTMLMediaElement)).resolves.toEqual({
      status: 'activation-required',
    })
    expect(context.createMediaElementSource).not.toHaveBeenCalled()
    expect(context.close).not.toHaveBeenCalled()
  })

  it('resumes from a page gesture before probing', async () => {
    const context = new FakeAudioContext('suspended')
    const probe = new MediaElementCaptureProbe(factoryFor(context), async () => undefined)

    await expect(probe.activate()).resolves.toBe(true)
    expect(context.resume).toHaveBeenCalledOnce()
  })

  it('uses one page context and one source per media element', async () => {
    const context = new FakeAudioContext()
    const factory = factoryFor(context)
    const probe = new MediaElementCaptureProbe(factory, async () => undefined, 2)
    const firstVideo = {} as HTMLMediaElement
    const secondVideo = {} as HTMLMediaElement

    const firstResult = probe.probe(firstVideo)
    context.analysers[0]!.windows.push(new Float32Array(32).fill(0.2))
    await expect(firstResult).resolves.toMatchObject({ status: 'ready' })

    const repeatedResult = probe.probe(firstVideo)
    context.analysers[0]!.windows.push(new Float32Array(32).fill(0.1))
    await repeatedResult

    const secondResult = probe.probe(secondVideo)
    context.analysers[1]!.windows.push(new Float32Array(32).fill(0.1))
    await secondResult

    expect(factory).toHaveBeenCalledOnce()
    expect(context.createMediaElementSource).toHaveBeenCalledTimes(2)
    expect(context.sources[0]!.connections).toContain(context.destination)
    expect(context.sources[1]!.connections).toContain(context.destination)
  })

  it('observes multiple windows before reporting that no signal was seen', async () => {
    const context = new FakeAudioContext()
    const waitForNextWindow = vi.fn(async () => undefined)
    const probe = new MediaElementCaptureProbe(factoryFor(context), waitForNextWindow, 3)

    await expect(probe.probe({} as HTMLMediaElement)).resolves.toEqual({
      status: 'no-signal-observed',
      windowsObserved: 3,
    })
    expect(waitForNextWindow).toHaveBeenCalledTimes(2)
  })

  it('keeps the raw destination connected when the analyser branch fails', async () => {
    const context = new FakeAudioContext()
    context.createMediaElementSource.mockImplementation(() => {
      const source = new FakeNode()
      source.failFor = context.analysers[0]
      context.sources.push(source)
      return source
    })
    const probe = new MediaElementCaptureProbe(factoryFor(context), async () => undefined)

    await expect(probe.probe({} as HTMLMediaElement)).resolves.toEqual({
      status: 'failed',
      reason: 'Unable to attach the non-audible signal monitor.',
    })
    expect(context.sources[0]!.connections).toEqual([context.destination])
  })
})
