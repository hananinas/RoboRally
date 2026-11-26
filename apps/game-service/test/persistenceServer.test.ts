import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import type { ClientToServerEvents, ServerToClientEvents } from '@robo-rally/game-events'
import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionStore, type SessionStore } from '@/auth/sessionStore'
import { DATABASE_FILE_NAME, openDatabase } from '@/infra/database'
import { createGameRepository } from '@/infra/GameRepository'
import { createGameSocketServer, type GameSocketServer } from '@/socket/gameServer'
import { authCookieHeader } from './authTestHelper.ts'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url))

describe('a game played over Socket.IO', () => {
  let dataDir: string
  let database: DatabaseSync
  let server: GameSocketServer
  let sessionStore: SessionStore
  let url: string
  let clients: Client[]

  beforeEach(async () => {
    clients = []
    dataDir = mkdtempSync(resolve(tmpdir(), 'robo-rally-'))
    execFileSync('dbmate', [
      '--url', `sqlite:${resolve(dataDir, DATABASE_FILE_NAME)}`,
      '--migrations-dir', MIGRATIONS_DIR,
      '--no-dump-schema',
      'up',
    ], { stdio: 'pipe' })
    database = openDatabase(dataDir)
    const http = createServer()
    sessionStore = createSessionStore({ oidcClient: { refreshToken: vi.fn() }, refreshBufferSeconds: 0 })
    server = createGameSocketServer(http, sessionStore, createGameRepository(database))
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    for (const client of clients) client.disconnect()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    database.close()
    rmSync(dataDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function connect(username: string): Promise<Client> {
    const client: Client = io(url, {
      autoConnect: false, transports: ['websocket'], reconnection: false, ackTimeout: 1000,
      extraHeaders: authCookieHeader(sessionStore, username, username),
    })
    clients.push(client)
    const connected = new Promise<void>((resolve) => client.once('connect', resolve))
    client.connect()
    await connected
    return client
  }

  async function startGame(): Promise<{ owner: Client; guest: Client; gameId: string }> {
    const owner = await connect('Bence')
    const guest = await connect('Dane')
    const created = await owner.emitWithAck('lobby.create', { mapName: 'test-map', name: 'Friday night' })
    if (created.outcome !== 'LOBBY_JOINED') throw new Error(created.outcome)
    const joined = await guest.emitWithAck('lobby.join', { lobbyId: created.lobby.lobbyId })
    if (joined.outcome !== 'LOBBY_JOINED') throw new Error(joined.outcome)
    const started = await owner.emitWithAck('lobby.start', {})
    if (started.outcome !== 'STARTED') throw new Error(started.outcome)
    return { owner, guest, gameId: started.gameId }
  }

  function gameRow() {
    return database.prepare('SELECT * FROM games').get()!
  }

  function playerRows() {
    return database.prepare('SELECT * FROM game_players ORDER BY user_id').all()
  }

  async function leave(client: Client) {
    const result = await client.emitWithAck('game.leave', {})
    if (result.outcome !== 'LEFT') throw new Error(result.outcome)
  }

  it('is stored as in progress with a row for every player', async () => {
    const { gameId } = await startGame()

    expect(gameRow()).toMatchObject({
      id: gameId,
      name: 'Friday night',
      map_name: 'test-map',
      status: 'in_progress',
      round_count: 0,
      finished_at: null,
      winner_player_id: null,
    })
    const stored = JSON.parse(gameRow().state as string)
    expect(stored.identities.map((identity: { username: string }) => identity.username)).toEqual(['Bence', 'Dane'])
    expect(stored.snapshot.players).toHaveLength(2)
    expect(playerRows().map((row) => row.user_id)).toEqual(['Bence', 'Dane'])
    expect(playerRows().every((row) => row.left_at === null)).toBe(true)
  })

  it('stops counting as in progress once everyone has left', async () => {
    const { owner, guest } = await startGame()
    const beforeLeaving = gameRow().state

    await leave(owner)
    await leave(guest)

    expect(gameRow()).toMatchObject({ status: 'aborted', state: beforeLeaving })
    expect(gameRow().finished_at).toEqual(expect.any(Number))
    expect(playerRows().every((row) => row.left_at !== null)).toBe(true)
  })
})
