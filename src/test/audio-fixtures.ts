/** Deterministic audio-block fixtures for protocol and pipeline tests. */

export type ChannelCount = 1 | 2

export type AudioBlockFixture = {
  sequence: number
  sampleRateHz: number
  channelCount: ChannelCount
  frameCount: number
  frames: Float32Array[]
}

export type CreateAudioBlockOptions = {
  sequence?: number
  sampleRateHz?: number
  channelCount?: ChannelCount
  frameCount?: number
  /** Constant sample value written into every channel. */
  fill?: number
}

const DEFAULT_SAMPLE_RATE_HZ = 48_000
const DEFAULT_FRAME_COUNT = 128

export function createAudioBlockFixture(
  options: CreateAudioBlockOptions = {},
): AudioBlockFixture {
  const sequence = options.sequence ?? 0
  const sampleRateHz = options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ
  const channelCount = options.channelCount ?? 2
  const frameCount = options.frameCount ?? DEFAULT_FRAME_COUNT
  const fill = options.fill ?? 0

  const frames: Float32Array[] = []
  for (let channel = 0; channel < channelCount; channel += 1) {
    frames.push(new Float32Array(frameCount).fill(fill))
  }

  return {
    sequence,
    sampleRateHz,
    channelCount,
    frameCount,
    frames,
  }
}

export function createSilentAudioBlock(
  options: Omit<CreateAudioBlockOptions, 'fill'> = {},
): AudioBlockFixture {
  return createAudioBlockFixture({ ...options, fill: 0 })
}

export function createConstantAudioBlock(
  fill: number,
  options: Omit<CreateAudioBlockOptions, 'fill'> = {},
): AudioBlockFixture {
  return createAudioBlockFixture({ ...options, fill })
}

export function totalFrameBytes(frames: Float32Array[]): number {
  let bytes = 0
  for (const channel of frames) {
    bytes += channel.byteLength
  }
  return bytes
}

export function assertAudioBlockShape(block: AudioBlockFixture): void {
  if (!Number.isInteger(block.sequence) || block.sequence < 0) {
    throw new Error('Audio block sequence must be a non-negative integer')
  }

  if (block.channelCount !== block.frames.length) {
    throw new Error('Audio block channelCount must match frames length')
  }

  for (const channel of block.frames) {
    if (channel.length !== block.frameCount) {
      throw new Error('Every audio channel must contain frameCount samples')
    }
  }
}
