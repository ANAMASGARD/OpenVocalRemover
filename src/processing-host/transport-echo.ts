import {
  assertAudioBlock,
  assertAudioBlockContinuity,
  getAudioBlockTransferables,
  type AudioBlock,
} from '../shared/audio.ts'

export type EchoTransportResult =
  | { type: 'processed'; block: AudioBlock; transfer: ArrayBuffer[] }
  | { type: 'rejected'; reason: 'invalid-block' | 'stale-session' | 'discontinuous' }

/** Deterministic Task 8 probe. This is not neural inference. */
export class EchoTransport {
  private previousBlock: AudioBlock | undefined

  constructor(private readonly sessionId: string) {
    if (sessionId.trim().length === 0) throw new Error('sessionId must not be empty')
  }

  accept(value: unknown): EchoTransportResult {
    if (
      typeof value !== 'object'
      || value === null
      || !('type' in value)
      || value.type !== 'captured'
      || !('block' in value)
    ) {
      return { type: 'rejected', reason: 'invalid-block' }
    }

    let block: AudioBlock
    try {
      block = assertAudioBlock(value.block)
    } catch {
      return { type: 'rejected', reason: 'invalid-block' }
    }
    if (block.sessionId !== this.sessionId) {
      return { type: 'rejected', reason: 'stale-session' }
    }
    if (this.previousBlock !== undefined) {
      try {
        assertAudioBlockContinuity(this.previousBlock, block)
      } catch {
        return { type: 'rejected', reason: 'discontinuous' }
      }
    }
    this.previousBlock = block
    return { type: 'processed', block, transfer: getAudioBlockTransferables(block) }
  }
}
