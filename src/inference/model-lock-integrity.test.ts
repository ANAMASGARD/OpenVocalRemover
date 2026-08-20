import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import modelLockJson from '../../models/model-lock.json'
import { validateModelLock } from './model-gate.ts'

function findOnnxFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...findOnnxFiles(path))
    else if (entry.isFile() && entry.name.endsWith('.onnx')) found.push(path)
  }
  return found
}

describe('selected model artifact integrity', () => {
  it('ships no unapproved ONNX binary and verifies any future selection exactly', () => {
    const lock = validateModelLock(modelLockJson)
    const modelRoot = join(process.cwd(), 'public', 'models')
    if (lock.selectedModelId === null) {
      expect(findOnnxFiles(modelRoot)).toEqual([])
      return
    }

    const selected = lock.candidates.find((candidate) => candidate.id === lock.selectedModelId)!
    const approval = selected.approval!
    const artifactPath = join(process.cwd(), approval.artifactPath)
    expect(relative(modelRoot, artifactPath).startsWith('..')).toBe(false)
    expect(existsSync(artifactPath)).toBe(true)
    expect(statSync(artifactPath).size).toBe(approval.artifactByteSize)
    expect(createHash('sha256').update(readFileSync(artifactPath)).digest('hex')).toBe(
      approval.artifactSha256,
    )
  })
})
