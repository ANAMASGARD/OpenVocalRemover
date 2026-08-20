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
  permissions?: string[]
  host_permissions?: string[]
  content_scripts?: Array<{
    matches?: string[]
    js?: string[]
    run_at?: string
  }>
  web_accessible_resources?: Array<{
    matches?: string[]
    resources?: string[]
  }>
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

/** Verifies the generated content script remains limited to YouTube watch pages. */
export function assertYouTubeContentScriptShape(manifest: BuiltManifest): void {
  const expectedMatch = 'https://www.youtube.com/watch*'

  if (manifest.permissions?.includes('<all_urls>')) {
    throw new Error('Extension permissions must not include <all_urls>')
  }
  if (manifest.host_permissions?.some((match) => match === '<all_urls>')) {
    throw new Error('Extension host_permissions must not include <all_urls>')
  }
  if (manifest.host_permissions?.length !== 1 || manifest.host_permissions[0] !== expectedMatch) {
    throw new Error('Extension host_permissions must contain only the YouTube watch-page match')
  }

  const contentScript = manifest.content_scripts?.find(
    (entry) => entry.matches?.length === 1 && entry.matches[0] === expectedMatch,
  )
  if (
    contentScript === undefined
    || contentScript.js === undefined
    || contentScript.js.length === 0
    || contentScript.run_at !== 'document_idle'
  ) {
    throw new Error('Manifest must include a document-idle YouTube watch-page content script')
  }

  for (const resource of manifest.web_accessible_resources ?? []) {
    if (resource.matches?.includes('<all_urls>')) {
      throw new Error('Content script resources must not be exposed to <all_urls>')
    }
  }
}
