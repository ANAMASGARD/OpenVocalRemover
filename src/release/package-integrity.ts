import type { BuiltManifest } from '../extension/built-manifest.ts'
import { assertFirefoxBackgroundShape } from '../extension/built-manifest.ts'

const AMO_MAXIMUM_ARCHIVE_BYTE_SIZE = 200 * 1024 * 1024
const EXPECTED_GECKO_ID = 'open-vocal-remover@extension.local'
const EXPECTED_HOST_PERMISSION = 'https://www.youtube.com/watch*'

type FirefoxReleaseManifest = BuiltManifest & {
  version?: string
  browser_specific_settings?: {
    gecko?: {
      id?: string
      data_collection_permissions?: { required?: string[] }
    }
  }
}

export type FirefoxReleasePackageInput = {
  archiveByteSize: number
  selectedModelId: string | null
  entries: string[]
  manifest: FirefoxReleaseManifest
}

function assertArchiveEntry(entry: string): void {
  if (
    entry.length === 0
    || entry.startsWith('/')
    || entry.includes('\\')
    || entry.split('/').includes('..')
  ) {
    throw new Error(`Firefox package contains unsafe path: ${entry}`)
  }
  if (
    entry.endsWith('.ts')
    || entry.endsWith('.tsx')
    || entry.endsWith('.map')
    || entry.startsWith('src/')
    || entry.startsWith('node_modules/')
    || entry.startsWith('.git/')
  ) {
    throw new Error(`Firefox package contains a development-only file: ${entry}`)
  }
}

/** Checks the extracted file list and manifest before an archive is handed to AMO. */
export function assertFirefoxReleasePackage(input: FirefoxReleasePackageInput): void {
  if (
    !Number.isInteger(input.archiveByteSize)
    || input.archiveByteSize <= 0
    || input.archiveByteSize > AMO_MAXIMUM_ARCHIVE_BYTE_SIZE
  ) {
    throw new Error('Firefox package exceeds the AMO 200 MB archive limit or has invalid size')
  }
  if (new Set(input.entries).size !== input.entries.length) {
    throw new Error('Firefox package contains duplicate archive entries')
  }
  input.entries.forEach(assertArchiveEntry)
  if (!input.entries.includes('manifest.json')) {
    throw new Error('Firefox package must contain manifest.json at the archive root')
  }
  for (const requiredEntry of [
    'index.html',
    'icons/icon-16.png',
    'icons/icon-32.png',
    'icons/icon-48.png',
    'icons/icon-128.png',
    'third-party/onnxruntime-web-LICENSE.txt',
  ]) {
    if (!input.entries.includes(requiredEntry)) {
      throw new Error(`Firefox package is missing ${requiredEntry}`)
    }
  }

  const ortRuntimeEntries = input.entries.filter(
    (entry) => /(^|\/)ort-wasm-simd-threaded[^/]*\.(?:mjs|wasm)$/u.test(entry),
  )
  if (
    ortRuntimeEntries.length !== 2
    || !ortRuntimeEntries.some((entry) => entry.endsWith('.mjs'))
    || !ortRuntimeEntries.some((entry) => entry.endsWith('.wasm'))
  ) {
    throw new Error('Firefox package must contain exactly the approved ORT MJS/Wasm pair')
  }

  const onnxEntries = input.entries.filter((entry) => entry.endsWith('.onnx'))
  if (input.selectedModelId === null && onnxEntries.length !== 0) {
    throw new Error('Firefox package contains ONNX data while no model is selected')
  }
  if (
    input.selectedModelId !== null
    && (
      onnxEntries.length !== 1
      || !onnxEntries[0]?.startsWith(`models/${input.selectedModelId}/`)
    )
  ) {
    throw new Error('Firefox package model does not match the selected model lock')
  }

  if (input.manifest.manifest_version !== 3) {
    throw new Error('Firefox package must use Manifest V3')
  }
  if (typeof input.manifest.version !== 'string' || input.manifest.version.length === 0) {
    throw new Error('Firefox package manifest is missing a version')
  }
  assertFirefoxBackgroundShape(input.manifest)
  if (
    input.manifest.permissions?.length !== 2
    || !input.manifest.permissions.includes('activeTab')
    || !input.manifest.permissions.includes('storage')
  ) {
    throw new Error('Firefox package permissions differ from the reviewed minimum')
  }
  if (
    input.manifest.host_permissions?.length !== 1
    || input.manifest.host_permissions[0] !== EXPECTED_HOST_PERMISSION
  ) {
    throw new Error('Firefox package host access must remain limited to YouTube watch pages')
  }
  const gecko = input.manifest.browser_specific_settings?.gecko
  if (gecko?.id !== EXPECTED_GECKO_ID) {
    throw new Error('Firefox package does not use the stable reviewed Gecko ID')
  }
  if (
    gecko.data_collection_permissions?.required?.length !== 1
    || gecko.data_collection_permissions.required[0] !== 'none'
  ) {
    throw new Error('Firefox package must truthfully declare no data collection')
  }
}
