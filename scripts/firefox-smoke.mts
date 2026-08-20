import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const EXPECTED_EXTENSION_ID = 'open-vocal-remover@extension.local'
const STARTUP_TIMEOUT_MS = 15_000
const COMMAND_TIMEOUT_MS = 10_000
const projectRoot = resolve(import.meta.dirname, '..')
const firefoxVersion = execFileSync('firefox', ['--version'], { encoding: 'utf8' }).trim()

type BidiResponse = {
  id?: number
  type?: 'success' | 'error'
  result?: unknown
  error?: string
  message?: string
}

function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a Firefox loopback port'))
        return
      }
      server.close((error) => {
        if (error !== undefined) reject(error)
        else resolvePort(address.port)
      })
    })
  })
}

function waitForFirefoxRemoteAgent(child: ChildProcess): Promise<void> {
  return new Promise((resolveReady, reject) => {
    let output = ''
    const timeout = setTimeout(() => {
      reject(new Error(`Firefox remote agent did not start: ${output.trim()}`))
    }, STARTUP_TIMEOUT_MS)
    const inspect = (chunk: Buffer): void => {
      output += chunk.toString('utf8')
      if (output.includes('WebDriver BiDi listening on')) {
        clearTimeout(timeout)
        resolveReady()
      }
    }
    child.stdout?.on('data', inspect)
    child.stderr?.on('data', inspect)
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Firefox exited before the smoke test (code ${String(code)}): ${output}`))
    })
  })
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolveSocket, reject) => {
    const socket = new WebSocket(url)
    socket.addEventListener('open', () => resolveSocket(socket), { once: true })
    socket.addEventListener('error', () => reject(new Error('WebDriver BiDi connection failed')), {
      once: true,
    })
  })
}

function commandClient(socket: WebSocket): (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown> {
  let nextId = 0
  return (method, params) => new Promise((resolveCommand, reject) => {
    nextId += 1
    const id = nextId
    const timeout = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      reject(new Error(`WebDriver BiDi command timed out: ${method}`))
    }, COMMAND_TIMEOUT_MS)
    const onMessage = (event: MessageEvent): void => {
      const response = JSON.parse(String(event.data)) as BidiResponse
      if (response.id !== id) return
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      if (response.type === 'error') {
        reject(new Error(`${method} failed: ${response.error ?? 'unknown'} ${response.message ?? ''}`))
      } else {
        resolveCommand(response.result)
      }
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function stopFirefox(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await new Promise<void>((resolveExit) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
      resolveExit()
    }, 3_000)
    child.once('exit', () => {
      clearTimeout(timeout)
      resolveExit()
    })
  })
}

execFileSync('npm', ['run', 'package:firefox:preview'], {
  cwd: projectRoot,
  stdio: 'inherit',
})
const packageMetadata = JSON.parse(
  readFileSync(resolve(projectRoot, 'package.json'), 'utf8'),
) as { version: string }
const archivePath = resolve(
  projectRoot,
  `artifacts/open-vocal-remover-${packageMetadata.version}-firefox-preview.zip`,
)
const profilePath = mkdtempSync(resolve(tmpdir(), 'open-vocal-remover-firefox-'))
const port = await reserveLoopbackPort()
const firefox = spawn('firefox', [
  '--headless',
  '--new-instance',
  '--profile', profilePath,
  '--remote-debugging-port', String(port),
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] })

let socket: WebSocket | undefined
try {
  await waitForFirefoxRemoteAgent(firefox)
  socket = await connect(`ws://127.0.0.1:${port}/session`)
  const send = commandClient(socket)
  await send('session.new', { capabilities: { alwaysMatch: { webSocketUrl: true } } })
  const installation = await send('webExtension.install', {
    extensionData: { type: 'archivePath', path: archivePath },
  }) as { extension?: unknown }
  if (installation.extension !== EXPECTED_EXTENSION_ID) {
    throw new Error(
      `Firefox installed unexpected extension ID: ${String(installation.extension)}`,
    )
  }
  await send('webExtension.uninstall', { extension: EXPECTED_EXTENSION_ID })
  await send('session.end', {})
  console.log(`${firefoxVersion} smoke test installed and removed ${EXPECTED_EXTENSION_ID}`)
} finally {
  socket?.close()
  await stopFirefox(firefox)
  rmSync(profilePath, { recursive: true, force: true })
}
