import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, relative, resolve } from 'node:path'

const MAXIMUM_SOURCE_ARCHIVE_BYTE_SIZE = 200 * 1024 * 1024
const projectRoot = resolve(import.meta.dirname, '..')
const artifactsDirectory = resolve(projectRoot, 'artifacts')
const sourceRootFiles = [
  '.gitignore',
  'README.md',
  'SOURCE_SUBMISSION.md',
  'build-target.ts',
  'eslint.config.js',
  'index.html',
  'manifest.config.ts',
  'package-lock.json',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
]
const sourceDirectories = ['docs', 'models', 'public', 'scripts', 'src']

function collectFiles(path: string): string[] {
  const metadata = statSync(path)
  if (metadata.isFile()) return [relative(projectRoot, path)]
  if (!metadata.isDirectory()) throw new Error(`Unsupported source entry: ${path}`)
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    collectFiles(resolve(path, entry.name)))
}

const metadata = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  version?: unknown
}
if (typeof metadata.version !== 'string' || metadata.version.length === 0) {
  throw new Error('package.json version is missing')
}
const requestedPaths = [
  ...sourceRootFiles.map((path) => resolve(projectRoot, path)),
  ...sourceDirectories.map((path) => resolve(projectRoot, path)),
]
for (const path of requestedPaths) {
  if (!existsSync(path)) throw new Error(`Source package input is missing: ${path}`)
}
const entries = requestedPaths.flatMap(collectFiles).sort()
if (entries.some((entry) => entry.startsWith('.git/') || entry.startsWith('node_modules/'))) {
  throw new Error('Source package includes a forbidden repository or dependency path')
}

mkdirSync(artifactsDirectory, { recursive: true })
const archivePath = resolve(
  artifactsDirectory,
  `open-vocal-remover-${metadata.version}-source.zip`,
)
rmSync(archivePath, { force: true })
rmSync(`${archivePath}.sha256`, { force: true })
execFileSync('zip', ['-X', '-q', archivePath, ...entries], {
  cwd: projectRoot,
  stdio: 'inherit',
})
const archiveByteSize = statSync(archivePath).size
if (archiveByteSize <= 0 || archiveByteSize > MAXIMUM_SOURCE_ARCHIVE_BYTE_SIZE) {
  throw new Error('Source archive is empty or exceeds AMO\'s 200 MB limit')
}
const digest = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
writeFileSync(`${archivePath}.sha256`, `${digest}  ${basename(archivePath)}\n`, 'utf8')
console.log(`AMO source package: ${archivePath}`)
