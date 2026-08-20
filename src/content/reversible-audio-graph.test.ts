import { describe, expect, it, vi } from 'vitest'
import {
  prepareReversibleAudioGraph,
  type AudioGraphContext,
  type AudioGraphNode,
  type GainNodePort,
  type GainParamPort,
} from './reversible-audio-graph.ts'

class FakeNode implements AudioGraphNode {
  readonly connections: AudioGraphNode[] = []

  connect(destination: AudioGraphNode): void {
    this.connections.push(destination)
  }

  disconnect(destination?: AudioGraphNode): void {
    if (destination === undefined) {
      this.connections.length = 0
      return
    }
    const index = this.connections.indexOf(destination)
    if (index >= 0) this.connections.splice(index, 1)
  }
}

class FakeParam implements GainParamPort {
  value = 1
  readonly ramps: Array<{ value: number; at: number }> = []
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void { this.value = value }
  linearRampToValueAtTime(value: number, at: number): void {
    this.value = value
    this.ramps.push({ value, at })
  }
}

class FakeGainNode extends FakeNode implements GainNodePort {
  readonly gain = new FakeParam()
}

function createContext() {
  const source = new FakeNode()
  const worklet = new FakeNode()
  const rawGain = new FakeGainNode()
  const processedGain = new FakeGainNode()
  const destination = new FakeNode()
  const events: string[] = []
  const context: AudioGraphContext = {
    currentTime: 5,
    destination,
    audioWorklet: { addModule: vi.fn(async () => { events.push('module') }) },
    createGain: vi.fn()
      .mockImplementationOnce(() => rawGain)
      .mockImplementationOnce(() => processedGain),
    createMediaElementSource: vi.fn(() => { events.push('source'); return source }),
  }
  const createWorklet = vi.fn(() => { events.push('worklet'); return worklet })
  return { context, source, worklet, rawGain, processedGain, destination, events, createWorklet }
}

describe('reversible audio graph', () => {
  it('prepares the complete processed branch before claiming media', async () => {
    const setup = createContext()
    const result = await prepareReversibleAudioGraph({
      context: setup.context,
      mediaElement: {} as HTMLMediaElement,
      moduleUrl: 'extension://transport-worklet.js',
      createWorkletNode: setup.createWorklet,
    })

    expect(result.status).toBe('ready')
    expect(setup.events).toEqual(['module', 'worklet', 'source'])
    expect(setup.source.connections).toEqual([setup.rawGain, setup.worklet])
    expect(setup.rawGain.connections).toEqual([setup.destination])
    expect(setup.processedGain.connections).toEqual([setup.destination])
    expect(setup.rawGain.gain.value).toBe(1)
    expect(setup.processedGain.gain.value).toBe(0)
  })

  it('crossfades to processed output and fails open to raw within 20 ms', async () => {
    const setup = createContext()
    const result = await prepareReversibleAudioGraph({
      context: setup.context,
      mediaElement: {} as HTMLMediaElement,
      moduleUrl: 'extension://transport-worklet.js',
      createWorkletNode: setup.createWorklet,
    })
    if (result.status !== 'ready') throw new Error('graph did not prepare')

    result.graph.selectProcessed()
    expect(setup.rawGain.gain.ramps.at(-1)).toEqual({ value: 0, at: 5.02 })
    expect(setup.processedGain.gain.ramps.at(-1)).toEqual({ value: 1, at: 5.02 })

    result.graph.failOpen()
    expect(setup.rawGain.gain.ramps.at(-1)).toEqual({ value: 1, at: 5.02 })
    expect(setup.processedGain.gain.ramps.at(-1)).toEqual({ value: 0, at: 5.02 })
  })

  it('does not claim media when worklet preparation fails', async () => {
    const setup = createContext()
    setup.context.audioWorklet.addModule = vi.fn(async () => {
      throw new Error('module blocked')
    })

    await expect(
      prepareReversibleAudioGraph({
        context: setup.context,
        mediaElement: {} as HTMLMediaElement,
        moduleUrl: 'extension://transport-worklet.js',
        createWorkletNode: setup.createWorklet,
      }),
    ).resolves.toEqual({
      status: 'failed',
      reason: 'AudioWorklet preparation failed before media capture.',
    })
    expect(setup.context.createMediaElementSource).not.toHaveBeenCalled()
  })

  it('keeps the processed branch connected until the fail-open ramp completes', async () => {
    const setup = createContext()
    let delayed: (() => void) | undefined
    const result = await prepareReversibleAudioGraph({
      context: setup.context,
      mediaElement: {} as HTMLMediaElement,
      moduleUrl: 'extension://transport-worklet.js',
      createWorkletNode: setup.createWorklet,
      delay: (callback, delayMs) => {
        expect(delayMs).toBe(20)
        delayed = callback
      },
    })
    if (result.status !== 'ready') throw new Error('graph did not prepare')

    const release = result.graph.releaseProcessedPath()
    expect(setup.source.connections).toContain(setup.worklet)
    expect(setup.worklet.connections).toContain(setup.processedGain)
    delayed?.()
    await release
    expect(setup.source.connections).not.toContain(setup.worklet)
    expect(setup.worklet.connections).not.toContain(setup.processedGain)
    await expect(result.graph.releaseProcessedPath()).resolves.toBeUndefined()
  })
})
