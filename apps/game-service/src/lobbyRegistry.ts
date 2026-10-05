import { randomUUID } from 'node:crypto'
import type {
  CreateLobby,
  LobbyMap,
  LobbySummary,
  User,
} from '@robo-rally/game-events'

type LobbyRecord = {
  lobbyId: string
  code: string
  name: string
  map: LobbyMap
  capacity: number
  players: Map<string, User>
  countdownEndsAt: number | null
}

type CreateResult =
  | { lobby: LobbySummary }
  | { error: 'LOBBY_CODE_TAKEN' }

type JoinResult =
  | { lobby: LobbySummary }
  | { error: 'LOBBY_NOT_FOUND' | 'LOBBY_FULL' | 'ALREADY_IN_LOBBY' }

export function createLobbyRegistry(capacity: number, countdownDurationMs: number) {
  const lobbiesByCode = new Map<string, LobbyRecord>()
  const lobbyCodeByUser = new Map<string, string>()

  function summarize(lobby: LobbyRecord): LobbySummary {
    return {
      lobbyId: lobby.lobbyId,
      code: lobby.code,
      name: lobby.name,
      map: lobby.map,
      players: [...lobby.players.values()].map((player) => player.username),
      playerCount: lobby.players.size,
      capacity: lobby.capacity,
      countdownEndsAt: lobby.countdownEndsAt,
    }
  }

  function startCountdownWhenFull(lobby: LobbyRecord): void {
    if (lobby.players.size >= lobby.capacity && lobby.countdownEndsAt === null) {
      lobby.countdownEndsAt = Date.now() + countdownDurationMs
    }
  }

  function create(user: User, request: CreateLobby): CreateResult {
    if (lobbiesByCode.has(request.code)) return { error: 'LOBBY_CODE_TAKEN' }
    const lobby: LobbyRecord = {
      lobbyId: randomUUID(),
      code: request.code,
      name: request.name,
      map: request.map,
      capacity,
      players: new Map([[user.userId, user]]),
      countdownEndsAt: null,
    }
    startCountdownWhenFull(lobby)
    lobbiesByCode.set(lobby.code, lobby)
    lobbyCodeByUser.set(user.userId, lobby.code)
    return { lobby: summarize(lobby) }
  }

  function join(user: User, code: string): JoinResult {
    const lobby = lobbiesByCode.get(code)
    if (!lobby) return { error: 'LOBBY_NOT_FOUND' }
    const existingCode = lobbyCodeByUser.get(user.userId)
    if (existingCode) {
      return existingCode === code
        ? { lobby: summarize(lobby) }
        : { error: 'ALREADY_IN_LOBBY' }
    }
    if (lobby.players.size >= lobby.capacity) return { error: 'LOBBY_FULL' }
    lobby.players.set(user.userId, user)
    lobbyCodeByUser.set(user.userId, code)
    startCountdownWhenFull(lobby)
    return { lobby: summarize(lobby) }
  }

  return {
    create,
    join,
    list: () => [...lobbiesByCode.values()].map(summarize),
  }
}