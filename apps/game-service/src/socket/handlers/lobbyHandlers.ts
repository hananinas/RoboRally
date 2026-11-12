import { err, ok, type Result } from 'neverthrow'
import { randomUUID } from 'node:crypto'
import type { Player } from '@/game/Player'
import type { Lobby, SessionContext } from '@/socket/sessionContext'
import { withSessionRequest } from '@/socket/utilities/withSessionRequest'
import { ROBOT_COLOURS } from '@/game/Robot'
import { boardMaps, type BoardMapName } from '@/game/boardMaps'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest, type GameInitialization, type LobbyState, type User,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult,
} from '@robo-rally/game-events'
import { createGameContext } from '@/socket/gameContext'
import { presentInitialization, type MembershipContext } from '@/socket/handlers/membershipHandlers'
import type { GameSocket } from '@/socket/gameServer'

const MAX_PLAYERS = 6
const lobbyRoom = (id: string) => `lobby:${id}`
export function presentLobby(lobby: Lobby): LobbyState {
  const map = boardMaps[lobby.mapName]
  return { lobbyId: lobby.lobbyId, name: lobby.name, mapName: lobby.mapName, mapDisplayName: map.name, mapIcon: map.icon,
    ownerUserId: lobby.members.keys().next().value!,
    playerCount: lobby.members.size, maxPlayers: MAX_PLAYERS,
    players: [...lobby.members.values()].map(({ user }) => ({ userId: user.userId, username: user.username })) }
}

function isBoardMapName(mapName: string): mapName is BoardMapName {
  return Object.hasOwn(boardMaps, mapName)
}

function presentBoardMaps() {
  return Object.entries(boardMaps).map(([mapName, map]) => ({
    mapName,
    name: map.name,
    icon: map.icon,
    defaultForLobbyCreation: map.defaultForLobbyCreation,
  }))
}

function defaultLobbyMapName(): BoardMapName {
  const mapName = (Object.keys(boardMaps) as BoardMapName[])
    .find((name) => boardMaps[name].defaultForLobbyCreation)
  if (!mapName) throw new Error('No default map is configured for lobby creation')
  return mapName
}

export function leaveLobby(context: SessionContext, socket: GameSocket): void {
  const userId = socket.data.user.userId
  const session = context.sessionsByUser.get(userId)
  if (session?.kind !== 'lobby') return
  const lobby = context.lobbies.get(session.lobbyId)
  if (lobby?.members.get(userId)?.connectionId !== socket.id) return
  lobby.members.delete(userId)
  context.sessionsByUser.delete(userId)
  void socket.leave(lobbyRoom(lobby.lobbyId))
  if (!lobby.members.size) context.lobbies.delete(lobby.lobbyId)
  else {
    context.io.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  }
}

export function handleListLobbies(
  context: SessionContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyListResult) => void,
): void {
  withSessionRequest(socket, 'lobby.list', emptyRequestSchema, payload, acknowledge, (_user, ack) => {
    ack({
      outcome: 'LOBBIES_FOUND',
      maps: presentBoardMaps(),
      lobbies: [...context.lobbies.values()].map((lobby) => {
        const { lobbyId, name, mapName, mapDisplayName, mapIcon, playerCount, maxPlayers } = presentLobby(lobby)
        return { lobbyId, name, mapName, mapDisplayName, mapIcon, playerCount, maxPlayers }
      }),
    })
  })
}

export function handleCreateLobby(
  context: SessionContext,
  socket: GameSocket,
  payload: CreateLobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withSessionRequest(socket, 'lobby.create', createLobbyRequestSchema, payload, acknowledge, (user, ack) => {
    const mapName = payload.mapName ?? defaultLobbyMapName()
    if (!isBoardMapName(mapName)) return ack({ outcome: 'INVALID_REQUEST' })
    const session = context.sessionsByUser.get(user.userId)
    if (session) {
      const existing = session.kind === 'lobby' ? context.lobbies.get(session.lobbyId) : undefined
      return ack(existing?.members.get(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existing) }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    const lobbyId = randomUUID()
    const lobby: Lobby = { lobbyId, name: payload.name ?? `Lobby ${lobbyId.slice(0, 8)}`, mapName,
      members: new Map([[user.userId, { user, connectionId: socket.id }]]) }
    void socket.join(lobbyRoom(lobbyId))
    context.lobbies.set(lobbyId, lobby)
    context.sessionsByUser.set(user.userId, { kind: 'lobby', lobbyId })
    ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
  })
}

export function handleJoinLobby(
  context: SessionContext,
  socket: GameSocket,
  payload: LobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withSessionRequest(socket, 'lobby.join', lobbyRequestSchema, payload, acknowledge, (user, ack) => {
    const lobby = context.lobbies.get(payload.lobbyId)
    if (!lobby) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    const session = context.sessionsByUser.get(user.userId)
    if (session) {
      return ack(session.kind === 'lobby' && session.lobbyId === lobby.lobbyId
        && lobby.members.get(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) }
        : { outcome: 'USER_ALREADY_IN_SESSION' })
    }
    if (lobby.members.size >= MAX_PLAYERS) return ack({ outcome: 'LOBBY_FULL' })
    void socket.join(lobbyRoom(lobby.lobbyId))
    lobby.members.set(user.userId, { user, connectionId: socket.id })
    context.sessionsByUser.set(user.userId, { kind: 'lobby', lobbyId: lobby.lobbyId })
    ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
    socket.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  })
}

export function handleLeaveLobby(
  context: SessionContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyLeaveResult) => void,
): void {
  withSessionRequest(socket, 'lobby.leave', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const session = context.sessionsByUser.get(user.userId)
    if (!session) return ack({ outcome: 'LEFT' })
    const lobby = session.kind === 'lobby' ? context.lobbies.get(session.lobbyId) : undefined
    if (lobby?.members.get(user.userId)?.connectionId !== socket.id) {
      return ack({ outcome: 'NOT_LOBBY_MEMBER' })
    }
    leaveLobby(context, socket)
    ack({ outcome: 'LEFT' })
  })
}

type ConnectedLobbyMember = { user: User; connectionId: string; socket: GameSocket }

function getConnectedMembers(context: SessionContext, lobby: Lobby): Result<ConnectedLobbyMember[], 'LOBBY_MEMBER_DISCONNECTED'> {
  const members: ConnectedLobbyMember[] = []
  for (const member of lobby.members.values()) {
    const socket = context.io.sockets.sockets.get(member.connectionId)
    if (!socket?.connected) return err('LOBBY_MEMBER_DISCONNECTED')
    members.push({ ...member, socket })
  }
  return ok(members)
}

export function handleStartLobby(
  context: SessionContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyStartResult) => void,
): void {
  const { io } = context
  withSessionRequest(socket, 'lobby.start', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const session = context.sessionsByUser.get(user.userId)
    const lobby = session?.kind === 'lobby' ? context.lobbies.get(session.lobbyId) : undefined
    if (!lobby || lobby.members.get(user.userId)?.connectionId !== socket.id) return ack({ outcome: 'NOT_LOBBY_MEMBER' })
    if (lobby.members.keys().next().value !== user.userId) return ack({ outcome: 'NOT_LOBBY_OWNER' })

    const connected = getConnectedMembers(context, lobby)
    if (connected.isErr()) return ack({ outcome: connected.error })

    // The in-memory adapter joins synchronously. Prepare everything before publishing
    // or notifying clients; no event-loop yield can change the roster mid-transition.
    let gameContext: MembershipContext | undefined
    let prepared: { member: { user: User; player: Player }; socket: GameSocket; initialization: GameInitialization }[] = []
    try {
      const preparedContext = createGameContext(io, context.createGame(lobby.mapName))
      gameContext = preparedContext
      const members = connected.value.map(({ socket: connection, ...member }) => {
        const result = preparedContext.game.addPlayer(ROBOT_COLOURS[preparedContext.memberships.size])
        if (result.isErr()) throw new Error(result.error)
        const membership = { ...member, player: result.value }
        preparedContext.memberships.set(member.user.userId, membership)
        return { member: membership, socket: connection }
      })
      const state = preparedContext.publicState()
      prepared = members.map((entry) => ({
        ...entry, initialization: presentInitialization(preparedContext, entry.member, state),
      }))
      for (const entry of prepared) {
        for (const room of [gameContext.publicRoom, gameContext.playerRoom(entry.member.player.id)]) {
          void entry.socket.join(room)
        }
      }
    } catch (error) {
      if (gameContext) {
        for (const { socket: connection, member } of prepared) {
          void connection.leave(gameContext.publicRoom)
          void connection.leave(gameContext.playerRoom(member.player.id))
        }
      }
      gameContext?.actionScheduler.stop()
      throw error
    }
    context.games.set(gameContext.gameId, gameContext)
    for (const entry of prepared) {
      context.sessionsByUser.set(entry.member.user.userId, { kind: 'game', gameId: gameContext.gameId })
      void entry.socket.leave(lobbyRoom(lobby.lobbyId))
    }
    context.lobbies.delete(lobby.lobbyId)
    for (const entry of prepared) {
      io.to(gameContext.playerRoom(entry.member.player.id)).emit('game.started', {
        lobbyId: lobby.lobbyId, initialization: entry.initialization,
      })
    }
    ack({ outcome: 'STARTED', gameId: gameContext.gameId })
  })
}
