import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base } from '@playwright/test'

export const GAME_SERVICE_URL = 'http://127.0.0.1:3002'

const mkcertCaRoot = execFileSync('mkcert', ['-CAROOT']).toString().trim()
const migrationsDir = fileURLToPath(new URL('../../game-service/migrations', import.meta.url))

function migratedDataDir(): string {
  const dataDir = mkdtempSync(resolve(tmpdir(), 'robo-rally-e2e-'))
  execFileSync('dbmate', [
    '--url', `sqlite:${resolve(dataDir, 'robo-rally.db')}`,
    '--migrations-dir', migrationsDir,
    '--no-dump-schema',
    'up',
  ])
  return dataDir
}

export const test = base.extend<{ realGameService: void; gameServiceArgs: readonly string[] }>({
  gameServiceArgs: [[
    '--import', fileURLToPath(new URL('./deterministic-random.mjs', import.meta.url)),
    fileURLToPath(new URL('../../game-service/dist/main.js', import.meta.url)),
  ], { option: true }],
  realGameService: [async ({ request, gameServiceArgs }, runTest) => {
    const gameDataDir = migratedDataDir()
    const service = spawn(process.execPath, gameServiceArgs, {
      env: {
        ...process.env,
        PORT: '3002',
        GAME_DATA_DIR: gameDataDir,
        NODE_EXTRA_CA_CERTS: `${mkcertCaRoot}/rootCA.pem`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const closed = new Promise<void>((resolve) => service.once('close', () => resolve()))
    let output = ''
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Game Service startup timed out:\n${output}`)), 10_000)
      const collect = (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-8_000)
        if (output.includes(`Game Service listening at ${GAME_SERVICE_URL}`)) {
          clearTimeout(timer)
          resolve()
        }
      }
      service.stdout.on('data', collect)
      service.stderr.on('data', collect)
      service.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      service.once('close', (code, signal) => {
        clearTimeout(timer)
        reject(new Error(`Game Service exited (${code ?? signal}):\n${output}`))
      })
    })

    try {
      await ready
      const response = await request.get(`${GAME_SERVICE_URL}/socket.io/?EIO=4&transport=polling`)
      if (!response.ok()) throw new Error(`Game Service readiness check failed:\n${output}`)
      await runTest(undefined)
    } finally {
      service.kill('SIGTERM')
      const timer = setTimeout(() => service.kill('SIGKILL'), 5_000)
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          closed,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error(`Game Service shutdown timed out:\n${output}`)), 10_000)
          }),
        ])
      } finally {
        clearTimeout(timer)
        clearTimeout(timeout)
        rmSync(gameDataDir, { recursive: true, force: true })
      }
    }
  }, { auto: true }],
})

export { expect } from '@playwright/test'
