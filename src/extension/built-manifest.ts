import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getBuildOutputDir,
  type BrowserTarget,
} from '../../build-target.ts'

export type BuiltManifestBackground = {
  service_worker?: string
  scripts?: string[]
  type?: string
  persistent?: boolean
}

export type BuiltManifest = {
  manifest_version: number
  background?: BuiltManifestBackground
  [key: string]: unknown
}

export function getBuiltManifestPath(target: BrowserTarget): string {
  return resolve(process.cwd(), getBuildOutputDir(target), 'manifest.json')
}

export function readBuiltManifest(target: BrowserTarget): BuiltManifest {
  const path = getBuiltManifestPath(target)
  const raw = readFileSync(path, 'utf8')
  return JSON.parse(raw) as BuiltManifest
}

/** Chrome MV3 keeps a single module service worker entry. */
export function assertChromeBackgroundShape(manifest: BuiltManifest): void {
  const background = manifest.background
  if (background == null) {
    throw new Error('Chrome manifest is missing background')
  }

  if (typeof background.service_worker !== 'string' || background.service_worker.length === 0) {
    throw new Error('Chrome manifest must define background.service_worker')
  }

  if (background.scripts !== undefined) {
    throw new Error('Chrome manifest must not define background.scripts')
  }
}

/** Firefox MV3 emits a scripts array instead of service_worker. */
export function assertFirefoxBackgroundShape(manifest: BuiltManifest): void {
  const background = manifest.background
  if (background == null) {
    throw new Error('Firefox manifest is missing background')
  }

  if (!Array.isArray(background.scripts) || background.scripts.length === 0) {
    throw new Error('Firefox manifest must define background.scripts')
  }

  if (background.service_worker !== undefined) {
    throw new Error('Firefox manifest must not define background.service_worker')
  }
}
