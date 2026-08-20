import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import modelLockJson from '../models/model-lock.json' with { type: 'json' }
import { validateModelLock } from '../src/inference/model-gate.ts'
import {
  assessFirefoxReleaseReadiness,
  parseFirefoxManualEvidence,
} from '../src/release/release-readiness.ts'
import {
  assertFirefoxReleasePackage,
  type FirefoxReleasePackageInput,
} from '../src/release/package-integrity.ts'

const projectRoot = resolve(import.meta.dirname, '..')
const firefoxBuildDirectory = resolve(projectRoot, 'dist/firefox')
const artifactsDirectory = resolve(projectRoot, 'artifacts')

type Arguments = { preview: boolean; evidencePath: string | null }

function parseArguments(argv: string[]): Arguments {
  let preview = false
  let evidencePath: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--preview') {
      preview = true
      continue
    }
    if (argument === '--evidence') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) {
        throw new Error('--evidence requires a JSON file path')
      }
      evidencePath = resolve(projectRoot, value)
      index += 1
      continue
    }
    throw new Error(`Unknown package argument: ${argument}`)
  }
  if (preview && evidencePath !== null) {
    throw new Error('--preview and --evidence cannot be combined')
  }
  return { preview, evidencePath }
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown
}

function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return collectFiles(path)
    if (!entry.isFile()) throw new Error(`Unsupported build entry: ${path}`)
    return [relative(firefoxBuildDirectory, path)]
  })
}

function packageName(version: string, preview: boolean): string {
  return `open-vocal-remover-${version}-firefox${preview ? '-preview' : ''}.zip`
}

function writeDigest(path: string): void {
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  writeFileSync(`${path}.sha256`, `${digest}  ${basename(path)}\n`, 'utf8')
}

const { preview, evidencePath } = parseArguments(process.argv.slice(2))
const modelLock = validateModelLock(modelLockJson)

if (!preview) {
  const evidence = evidencePath === null
    ? null
    : parseFirefoxManualEvidence(readJson(evidencePath))
  const readiness = assessFirefoxReleaseReadiness(modelLock, evidence)
  if (!readiness.ready) {
    throw new Error(`Firefox release is blocked: ${readiness.blockers.join(', ')}`)
  }
}

execFileSync('npm', ['run', 'build:firefox'], { cwd: projectRoot, stdio: 'inherit' })

const packageMetadata = readJson(resolve(projectRoot, 'package.json')) as { version?: unknown }
if (typeof packageMetadata.version !== 'string' || packageMetadata.version.length === 0) {
  throw new Error('package.json version is missing')
}
const entries = collectFiles(firefoxBuildDirectory).sort()
mkdirSync(artifactsDirectory, { recursive: true })
const archivePath = resolve(
  artifactsDirectory,
  packageName(packageMetadata.version, preview),
)
rmSync(archivePath, { force: true })
rmSync(`${archivePath}.sha256`, { force: true })
execFileSync('zip', ['-X', '-q', archivePath, ...entries], {
  cwd: firefoxBuildDirectory,
  stdio: 'inherit',
})

const manifest = readJson(resolve(firefoxBuildDirectory, 'manifest.json'))
assertFirefoxReleasePackage({
  archiveByteSize: statSync(archivePath).size,
  selectedModelId: modelLock.selectedModelId,
  entries,
  manifest,
} as FirefoxReleasePackageInput)
writeDigest(archivePath)
console.log(`${preview ? 'Preview' : 'Release'} Firefox package: ${archivePath}`)
