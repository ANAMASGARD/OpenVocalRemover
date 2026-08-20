import { describe, expect, it, vi } from 'vitest'
import type { ModelSelection } from '../inference/runtime-model.ts'
import { PreparedInferenceEndpoint } from './inference-client.ts'
import {
  RealtimePipelineSession,
  assessRealtimePipelineAvailability,
} from './audio-pipeline.ts'

class FakeVideo extends EventTarget {}

function readyFixture() {
  const channel = new MessageChannel()
  const endpoint = new PreparedInferenceEndpoint(
    'session-1', 'fixture', 'wasm-simd', channel.port1,
  )
  const workletPort = { postMessage: vi.fn(), onmessage: null } as unknown as MessagePort
  const graph = {
    selectProcessed: vi.fn(),
    failOpen: vi.fn(),
    releaseProcessedPath: vi.fn(async () => undefined),
  }
  let workerFailure: (() => void) | undefined
  const host = {
    close: vi.fn(),
    onWorkerFailure: vi.fn((listener: () => void) => {
      workerFailure = listener
      return () => { workerFailure = undefined }
    }),
  }
  const onStatus = vi.fn()
  const video = new FakeVideo()
  const session = new RealtimePipelineSession({
    sessionId: 'session-1',
    endpoint,
    workletControlPort: workletPort,
    graph,
    host,
    video,
    onStatus,
  })
  return {
    session, workletPort, graph, host, video, onStatus,
    failWorker: () => workerFailure?.(),
  }
}

describe('realtime audio pipeline control plane', () => {
  it('gates all resources when no model or capture proof is available', () => {
    expect(assessRealtimePipelineAvailability(
      { available: false, reason: 'no-approved-model' },
      'unverified',
    )).toEqual({ available: false, reason: 'no-approved-model' })
    const selected = {
      available: true, model: { id: 'fixture', approval: {} },
    } as ModelSelection
    expect(assessRealtimePipelineAvailability(selected, 'unverified')).toEqual({
      available: false, reason: 'capture-unverified',
    })
  })

  it('selects processed output only after the worklet reports its startup watermark', () => {
    const fixture = readyFixture()
    fixture.session.start()
    expect(fixture.graph.selectProcessed).not.toHaveBeenCalled()
    expect(fixture.onStatus).toHaveBeenCalledWith({ state: 'warming' })

    fixture.workletPort.onmessage?.({ data: {
      type: 'processing-ready', sessionId: 'session-1', bufferedBlockCount: 2,
    } } as MessageEvent)
    expect(fixture.workletPort.postMessage).toHaveBeenCalledWith({
      type: 'select-processed', sessionId: 'session-1',
    })
    expect(fixture.graph.selectProcessed).toHaveBeenCalledOnce()
    expect(fixture.onStatus).toHaveBeenLastCalledWith({ state: 'processing' })
  })

  it('fails open once on a late block, worker crash, or media discontinuity', async () => {
    const late = readyFixture()
    late.session.start()
    late.workletPort.onmessage?.({ data: {
      type: 'pipeline-fault', sessionId: 'session-1', reason: 'deadline-miss',
    } } as MessageEvent)
    await late.session.whenStopped()
    expect(late.graph.failOpen).toHaveBeenCalledOnce()
    expect(late.host.close).toHaveBeenCalledOnce()
    expect(late.onStatus).toHaveBeenLastCalledWith({
      state: 'bypassed', reason: 'deadline-miss',
    })

    const crashed = readyFixture()
    crashed.session.start()
    crashed.failWorker()
    await crashed.session.whenStopped()
    expect(crashed.graph.failOpen).toHaveBeenCalledOnce()
    expect(crashed.onStatus).toHaveBeenLastCalledWith({
      state: 'bypassed', reason: 'worker-failure',
    })

    const seek = readyFixture()
    seek.session.start()
    seek.video.dispatchEvent(new Event('seeking'))
    await seek.session.whenStopped()
    expect(seek.onStatus).toHaveBeenLastCalledWith({ state: 'bypassed', reason: 'seek' })
  })

  it('ignores stale statuses and makes repeated stop harmless', async () => {
    const fixture = readyFixture()
    fixture.session.start()
    fixture.workletPort.onmessage?.({ data: {
      type: 'processing-ready', sessionId: 'old-session', bufferedBlockCount: 2,
    } } as MessageEvent)
    expect(fixture.graph.selectProcessed).not.toHaveBeenCalled()
    await fixture.session.stop('disabled')
    await fixture.session.stop('disabled')
    expect(fixture.graph.failOpen).toHaveBeenCalledOnce()
    expect(fixture.host.close).toHaveBeenCalledOnce()
  })
})
