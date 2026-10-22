import { randomUUID } from 'node:crypto'
import {
  emptyRequestSchema, lobbyRequestSchema,
  type EmptyRequest, type LobbyRequest, type LobbySummary, type LobbyState, type LobbyFailure,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult, type SessionResult, type User,
} from '@robo-rally/game-events'
import { logError } from '@/logger'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import { handleGameSession, presentInitialization, type MembershipContext } from '@/socket/handlers/membershipHandlers'
import type { GameSocket } from '@/socket/gameServer'

export type WaitingLobby = {
  lobbyId: string
  name: string
  members: Map<string, { user: User; connectionId: string }>
}

export type LobbyContext = {
  lobbies: Map<string, WaitingLobby>
  games: Map<string, MembershipContext>
  createGameContext: () => MembershipContext
}

export const lobbyRoom = (lobbyId: string): string => `lobby:${lobbyId}`

export function findGame(ctx: LobbyContext, userId: string): MembershipContext | undefined {
  return [...ctx.games.values()].find((game) => game.memberships.has(userId))
}

function findLobby(ctx: LobbyContext, userId: string): WaitingLobby | undefined {
  return [...ctx.lobbies.values()].find((lobby) => lobby.members.has(userId))
}

function summary(lobby: WaitingLobby): LobbySummary {
  return { lobbyId: lobby.lobbyId, name: lobby.name, playerCount: lobby.members.size, maxPlayers: 6 }
}

function state(lobby: WaitingLobby): LobbyState {
  return { ...summary(lobby), ownerUserId: lobby.members.keys().next().value! }
}

function validate(socket: GameSocket, payload: unknown, schema: typeof emptyRequestSchema | typeof lobbyRequestSchema): LobbyFailure | undefined {
  if (!socket.data.user) return { outcome: 'LOGIN_REQUIRED' }
  if (!schema.safeParse(payload).success) return { outcome: 'INVALID_REQUEST' }
  return undefined
}

function reportFailure(command: string, error: unknown): LobbyFailure {
  logError('Failed to process lobby request', error, { command })
  return { outcome: 'INTERNAL_ERROR' }
}

export function handleLobbyList(ctx: LobbyContext, socket: GameSocket, payload: EmptyRequest, acknowledge: (result: LobbyListResult) => void): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const failure = validate(socket, payload, emptyRequestSchema)
    ack(failure ?? { outcome: 'LOBBIES_FOUND', lobbies: [...ctx.lobbies.values()].map(summary) })
  }, (error) => reportFailure('lobby.list', error))
}

export function handleLobbyJoin(ctx: LobbyContext, socket: GameSocket, payload: EmptyRequest | LobbyRequest, acknowledge: (result: LobbyJoinResult) => void, create = false): void {
  let joined: WaitingLobby | undefined
  withAcknowledgeOnce(acknowledge, (ack) => {
    const failure = validate(socket, payload, create ? emptyRequestSchema : lobbyRequestSchema)
    if (failure) return ack(failure)
    const user = socket.data.user!
    if (findGame(ctx, user.userId) || findLobby(ctx, user.userId)) return ack({ outcome: 'USER_ALREADY_IN_SESSION' })
    const lobbyId = create ? randomUUID() : (payload as LobbyRequest).lobbyId
    const lobby = create
      ? { lobbyId, name: `Rally ${lobbyId.slice(0, 8)}`, members: new Map<string, { user: User; connectionId: string }>() }
      : ctx.lobbies.get(lobbyId)
    if (!lobby) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    if (lobby.members.size >= 6) return ack({ outcome: 'LOBBY_FULL' })
    joined = lobby
    lobby.members.set(user.userId, { user, connectionId: socket.id })
    ctx.lobbies.set(lobbyId, lobby)
    void socket.join(lobbyRoom(lobbyId))
    ack({ outcome: 'LOBBY_JOINED', lobby: state(lobby) })
    socket.nsp.to(lobbyRoom(lobbyId)).emit('lobby.updated', { lobby: state(lobby) })
  }, (error, acknowledged) => {
    if (joined && !acknowledged) removeWaitingMember(ctx, socket, joined)
    return reportFailure(create ? 'lobby.create' : 'lobby.join', error)
  })
}

export function removeWaitingMember(ctx: LobbyContext, socket: GameSocket, lobby = findLobby(ctx, socket.data.user?.userId ?? '')): void {
  if (!lobby || !socket.data.user || lobby.members.get(socket.data.user.userId)?.connectionId !== socket.id) return
  lobby.members.delete(socket.data.user.userId)
  void socket.leave(lobbyRoom(lobby.lobbyId))
  if (lobby.members.size === 0) ctx.lobbies.delete(lobby.lobbyId)
  else socket.nsp.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: state(lobby) })
}

export function handleLobbyLeave(ctx: LobbyContext, socket: GameSocket, payload: LobbyRequest, acknowledge: (result: LobbyLeaveResult) => void): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const failure = validate(socket, payload, lobbyRequestSchema)
    if (failure) return ack(failure)
    const lobby = ctx.lobbies.get(payload.lobbyId)
    if (!lobby) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    if (lobby.members.get(socket.data.user!.userId)?.connectionId !== socket.id) return ack({ outcome: 'NOT_LOBBY_MEMBER' })
    removeWaitingMember(ctx, socket, lobby)
    ack({ outcome: 'LEFT' })
  }, (error) => reportFailure('lobby.leave', error))
}

export function handleLobbyStart(ctx: LobbyContext, socket: GameSocket, payload: LobbyRequest, acknowledge: (result: LobbyStartResult) => void): void {
  let game: MembershipContext | undefined
  let committed = false
  withAcknowledgeOnce(acknowledge, (ack) => {
    const failure = validate(socket, payload, lobbyRequestSchema)
    if (failure) return ack(failure)
    const lobby = ctx.lobbies.get(payload.lobbyId)
    if (!lobby) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    const userId = socket.data.user!.userId
    if (lobby.members.get(userId)?.connectionId !== socket.id) return ack({ outcome: 'NOT_LOBBY_MEMBER' })
    if (lobby.members.keys().next().value !== userId) return ack({ outcome: 'NOT_LOBBY_OWNER' })
    game = ctx.createGameContext()
    if (ctx.games.has(game.gameId)) throw new Error('Game factory returned a duplicate game ID')
    for (const { user, connectionId } of lobby.members.values()) {
      const added = game.game.addPlayer()
      if (added.isErr()) throw new Error(`Unable to build lobby roster: ${added.error}`)
      game.memberships.set(user.userId, { user, player: added.value, connectionId })
    }
    game.game.start()
    // Construct every private snapshot before granting rooms or committing the transition.
    const initializations = [...game.memberships.values()].map((membership) => ({
      membership, initialization: presentInitialization(game!, membership),
    }))
    for (const { membership } of initializations) {
      const memberSocket = socket.nsp.sockets.get(membership.connectionId!)
      if (!memberSocket) throw new Error('Lobby member disconnected before start')
      void memberSocket.join([game.publicRoom, game.playerRoom(membership.player.id)])
    }
    ctx.games.set(game.gameId, game)
    ctx.lobbies.delete(lobby.lobbyId)
    socket.nsp.in(lobbyRoom(lobby.lobbyId)).socketsLeave(lobbyRoom(lobby.lobbyId))
    committed = true
    for (const { membership, initialization } of initializations) {
      game.io.to(game.playerRoom(membership.player.id)).emit('game.started', { lobbyId: lobby.lobbyId, initialization })
    }
    ack({ outcome: 'STARTED', gameId: game.gameId })
  }, (error) => {
    if (game && !committed) {
      game.actionScheduler.stop()
      for (const membership of game.memberships.values()) {
        const memberSocket = socket.nsp.sockets.get(membership.connectionId!)
        void memberSocket?.leave(game.publicRoom)
        void memberSocket?.leave(game.playerRoom(membership.player.id))
        game.game.removePlayer(membership.player.id)
      }
      game.memberships.clear()
    }
    return reportFailure('lobby.start', error)
  })
}

export function handleSessionGet(ctx: LobbyContext, socket: GameSocket, payload: EmptyRequest, acknowledge: (result: SessionResult) => void): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const failure = validate(socket, payload, emptyRequestSchema)
    if (failure) return ack(failure)
    const userId = socket.data.user!.userId
    const lobby = findLobby(ctx, userId)
    if (lobby) return ack(lobby.members.get(userId)!.connectionId === socket.id
      ? { outcome: 'IN_LOBBY', lobby: state(lobby) }
      : { outcome: 'USER_ALREADY_IN_SESSION' })
    const game = findGame(ctx, userId)
    if (game) handleGameSession(game, socket, ack)
    else ack({ outcome: 'NO_SESSION' })
  }, (error) => reportFailure('session.get', error))
}
