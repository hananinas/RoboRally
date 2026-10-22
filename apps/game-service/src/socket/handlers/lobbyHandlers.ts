import { randomUUID } from 'node:crypto'
import type { Player } from '@/game/Player'
import { ROBOT_COLOURS } from '@/game/Robot'
import {
  emptyRequestSchema, lobbyRequestSchema,
  type GameInitialization, type LobbyFailure, type LobbyState, type User,
} from '@robo-rally/game-events'
import { createGameContext } from '@/socket/gameContext'
import { presentInitialization, type MembershipContext } from '@/socket/handlers/membershipHandlers'
import type { GameSession, GameSocket, GameSocketServer } from '@/socket/gameServer'

type Lobby = {
  lobbyId: string
  name: string
  ownerUserId: string
  members: Map<string, { user: User; connectionId: string }>
}
export type UserSession = { kind: 'lobby'; lobbyId: string } | { kind: 'game'; gameId: string }
export type SessionStore = {
  games: Map<string, MembershipContext>
  lobbies: Map<string, Lobby>
  sessionsByUser: Map<string, UserSession>
  createGame: () => GameSession
}
const MAX_PLAYERS = 6
const lobbyRoom = (id: string) => `lobby:${id}`
export function presentLobby(lobby: Lobby): LobbyState {
  return { lobbyId: lobby.lobbyId, name: lobby.name, ownerUserId: lobby.ownerUserId,
    playerCount: lobby.members.size, maxPlayers: MAX_PLAYERS }
}

export function leaveLobby(io: GameSocketServer, store: SessionStore, socket: GameSocket): void {
  const userId = socket.data.user?.userId ?? ''
  const session = store.sessionsByUser.get(userId)
  if (session?.kind !== 'lobby') return
  const lobby = store.lobbies.get(session.lobbyId)
  if (lobby?.members.get(userId)?.connectionId !== socket.id) return
  lobby.members.delete(userId)
  store.sessionsByUser.delete(userId)
  void socket.leave(lobbyRoom(lobby.lobbyId))
  if (!lobby.members.size) store.lobbies.delete(lobby.lobbyId)
  else {
    if (lobby.ownerUserId === userId) lobby.ownerUserId = lobby.members.keys().next().value!
    io.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  }
}

export function registerLobbyHandlers(io: GameSocketServer, store: SessionStore, socket: GameSocket): void {
  function validate(payload: unknown, identified: boolean): LobbyFailure | undefined {
    if (!socket.data.user) return { outcome: 'LOGIN_REQUIRED' }
    if (!(identified ? lobbyRequestSchema : emptyRequestSchema).safeParse(payload).success) {
      return { outcome: 'INVALID_REQUEST' }
    }
  }
  socket.on('lobby.list', (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    const failure = validate(payload, false)
    if (failure) return acknowledge(failure)
    acknowledge({ outcome: 'LOBBIES_FOUND', lobbies: [...store.lobbies.values()].map((lobby) => {
      const { ownerUserId: _, ...summary } = presentLobby(lobby)
      return summary
    }) })
  })
  socket.on('lobby.create', (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    const failure = validate(payload, false)
    if (failure) return acknowledge(failure)
    const user = socket.data.user!
    const session = store.sessionsByUser.get(user.userId)
    if (session) {
      const existing = session.kind === 'lobby' ? store.lobbies.get(session.lobbyId) : undefined
      return acknowledge(existing?.members.get(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existing) }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    const lobbyId = randomUUID()
    const lobby: Lobby = { lobbyId, name: `Lobby ${lobbyId.slice(0, 8)}`, ownerUserId: user.userId,
      members: new Map([[user.userId, { user, connectionId: socket.id }]]) }
    void socket.join(lobbyRoom(lobbyId))
    store.lobbies.set(lobbyId, lobby)
    store.sessionsByUser.set(user.userId, { kind: 'lobby', lobbyId })
    acknowledge({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
  })
  socket.on('lobby.join', (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    const failure = validate(payload, true)
    if (failure) return acknowledge(failure)
    const user = socket.data.user!
    const lobby = store.lobbies.get(payload.lobbyId)
    if (!lobby) return acknowledge({ outcome: 'LOBBY_NOT_FOUND' })
    const session = store.sessionsByUser.get(user.userId)
    if (session) {
      return acknowledge(session.kind === 'lobby' && session.lobbyId === lobby.lobbyId
        && lobby.members.get(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    if (lobby.members.size >= MAX_PLAYERS) return acknowledge({ outcome: 'LOBBY_FULL' })
    void socket.join(lobbyRoom(lobby.lobbyId))
    lobby.members.set(user.userId, { user, connectionId: socket.id })
    store.sessionsByUser.set(user.userId, { kind: 'lobby', lobbyId: lobby.lobbyId })
    acknowledge({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
    socket.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  })
  socket.on('lobby.leave', (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    const failure = validate(payload, true)
    if (failure) return acknowledge(failure)
    const session = store.sessionsByUser.get(socket.data.user!.userId)
    if (!session) return acknowledge({ outcome: 'LEFT' })
    const lobby = store.lobbies.get(payload.lobbyId)
    if (session.kind !== 'lobby' || session.lobbyId !== payload.lobbyId
      || lobby?.members.get(socket.data.user!.userId)?.connectionId !== socket.id) {
      return acknowledge({ outcome: 'NOT_LOBBY_MEMBER' })
    }
    leaveLobby(io, store, socket)
    acknowledge({ outcome: 'LEFT' })
  })
  socket.on('lobby.start', (payload, acknowledge) => {
    if (typeof acknowledge !== 'function') return
    const failure = validate(payload, true)
    if (failure) return acknowledge(failure)
    const user = socket.data.user!
    const lobby = store.lobbies.get(payload.lobbyId)
    if (!lobby) return acknowledge({ outcome: 'LOBBY_NOT_FOUND' })
    if (lobby.members.get(user.userId)?.connectionId !== socket.id) return acknowledge({ outcome: 'NOT_LOBBY_MEMBER' })
    if (lobby.ownerUserId !== user.userId) return acknowledge({ outcome: 'NOT_LOBBY_OWNER' })

    // The in-memory adapter joins synchronously. Prepare everything before publishing
    // or notifying clients; no event-loop yield can change the roster mid-transition.
    let ctx: MembershipContext | undefined
    const joinedRooms: { socket: GameSocket; room: string }[] = []
    let prepared: { member: { user: User; player: Player }; socket: GameSocket; initialization: GameInitialization }[]
    try {
      ctx = createGameContext(io, store.createGame())
      for (const member of lobby.members.values()) {
        const connection = io.sockets.sockets.get(member.connectionId)
        if (!connection?.connected) throw new Error('Lobby member disconnected')
        const result = ctx.game.addPlayer(ROBOT_COLOURS[ctx.memberships.size])
        if (result.isErr()) throw new Error(result.error)
        const player = result.value
        ctx.memberships.set(member.user.userId, { ...member, player })
      }
      prepared = [...ctx.memberships.values()].map((member) => ({
        member, socket: io.sockets.sockets.get(member.connectionId!)!,
        initialization: presentInitialization(ctx!, member),
      }))
      for (const entry of prepared) {
        for (const room of [ctx.publicRoom, ctx.playerRoom(entry.member.player.id)]) {
          joinedRooms.push({ socket: entry.socket, room })
          void entry.socket.join(room)
        }
      }
    } catch {
      for (const entry of joinedRooms) void entry.socket.leave(entry.room)
      ctx?.actionScheduler.stop()
      acknowledge({ outcome: 'INTERNAL_ERROR' })
      return
    }
    store.games.set(ctx.gameId, ctx)
    for (const entry of prepared) {
      store.sessionsByUser.set(entry.member.user.userId, { kind: 'game', gameId: ctx.gameId })
      void entry.socket.leave(lobbyRoom(lobby.lobbyId))
    }
    store.lobbies.delete(lobby.lobbyId)
    for (const entry of prepared) {
      io.to(ctx.playerRoom(entry.member.player.id)).emit('game.started', {
        lobbyId: lobby.lobbyId, initialization: entry.initialization,
      })
    }
    acknowledge({ outcome: 'STARTED', gameId: ctx.gameId })
  })
}
