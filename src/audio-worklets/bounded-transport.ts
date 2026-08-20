import { assertAudioBlockContinuity, type AudioBlock, type ChannelCount } from '../shared/audio.ts'

export type QueueEnqueueResult = 'accepted' | 'overflow' | 'discontinuous'

/** Fixed-capacity FIFO shared by deterministic tests and worklet message handlers. */
export class BoundedAudioBlockQueue {
  private readonly blocks: AudioBlock[] = []
  private lastAccepted: AudioBlock | undefined

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error('queue capacity must be a positive integer')
    }
  }

  enqueue(block: AudioBlock): QueueEnqueueResult {
    if (this.blocks.length >= this.capacity) {
      return 'overflow'
    }
    if (this.lastAccepted !== undefined) {
      try {
        assertAudioBlockContinuity(this.lastAccepted, block)
      } catch {
        return 'discontinuous'
      }
    }
    this.blocks.push(block)
    this.lastAccepted = block
    return 'accepted'
  }

  dequeue(): AudioBlock | undefined {
    return this.blocks.shift()
  }

  clear(): void {
    this.blocks.length = 0
    this.lastAccepted = undefined
  }

  get size(): number {
    return this.blocks.length
  }
}

export type AudioBufferPoolConfiguration = {
  blockCount: number
  channelCount: ChannelCount
  frameCount: number
}

/** Owns a fixed pool; returned transfer buffers are rewrapped outside process(). */
export class RecyclableAudioBufferPool {
  private readonly available: Array<Array<Float32Array<ArrayBuffer>>> = []

  constructor(private readonly configuration: AudioBufferPoolConfiguration) {
    if (!Number.isInteger(configuration.blockCount) || configuration.blockCount <= 0) {
      throw new Error('blockCount must be a positive integer')
    }
    if (configuration.channelCount !== 1 && configuration.channelCount !== 2) {
      throw new Error('channelCount must be 1 or 2')
    }
    if (!Number.isInteger(configuration.frameCount) || configuration.frameCount <= 0) {
      throw new Error('frameCount must be a positive integer')
    }
    for (let block = 0; block < configuration.blockCount; block += 1) {
      this.available.push(this.createFrames())
    }
  }

  acquire(): Array<Float32Array<ArrayBuffer>> | undefined {
    return this.available.pop()
  }

  release(buffers: ArrayBuffer[]): void {
    if (buffers.length !== this.configuration.channelCount) {
      throw new Error('returned buffer channel count does not match the pool')
    }
    if (this.available.length >= this.configuration.blockCount) {
      throw new Error('buffer pool cannot grow beyond blockCount')
    }
    const expectedByteLength = this.configuration.frameCount * Float32Array.BYTES_PER_ELEMENT
    const frames = buffers.map((buffer) => {
      if (buffer.byteLength !== expectedByteLength) {
        throw new Error('returned buffer frame count does not match the pool')
      }
      return new Float32Array(buffer)
    })
    this.available.push(frames)
  }

  private createFrames(): Array<Float32Array<ArrayBuffer>> {
    return Array.from(
      { length: this.configuration.channelCount },
      () => new Float32Array(this.configuration.frameCount),
    )
  }
}
