import { err, ok, type Result } from 'neverthrow'
import type { Player } from '@/domain/game/Player'
import { Lobby } from '@/domain/lobby/Lobby'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { ROBOT_COLOURS } from '@/domain/game/Robot'
import { boardMaps, type BoardMapName } from '@/domain/game/boardMaps'
import { createGame } from '@/domain/game/GameFactory'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest, type GameInitialization, type User,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult,
} from '@robo-rally/game-events'
import { createGameContext } from '@/socket/gameSession/gameContext'
import type { MembershipContext } from '@/socket/gameSession/gameMembership'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { LobbySession } from '@/socket/LobbySession'
import { presentInitialization } from '@/socket/presenters/gamePresenter'
import { presentBoardMaps, presentLobby, presentLobbySummary } from '@/socket/presenters/lobbyPresenter'

function isBoardMapName(mapName: string): mapName is BoardMapName {
  return Object.hasOwn(boardMaps, mapName)
}

export function leaveLobby(context: SocketContext, socket: GameSocket): Result<void, 'NOT_A_MEMBER'> {
  const userId = socket.data.user.userId
  const session = context.registry.getCurrentLobby(userId)
  if (!session) return err('NOT_A_MEMBER')
  return session.isMember(socket).map(() => {
    session.leave(socket)
    context.registry.clearActiveMembership(userId)
    if (session.lobby.size === 0) context.registry.removeLobby(session.lobby.lobbyId)
  })
}

export function handleListLobbies(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyListResult) => void,
): void {
  withValidatedRequest(socket, 'lobby.list', emptyRequestSchema, payload, acknowledge, (_user, ack) => {
    ack({
      outcome: 'LOBBIES_FOUND',
      maps: presentBoardMaps(),
      lobbies: context.registry.lobbies.map((session) => presentLobbySummary(session.lobby)),
    })
  })
}

export function handleCreateLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: CreateLobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withValidatedRequest(socket, 'lobby.create', createLobbyRequestSchema, payload, acknowledge, (user, ack) => {
    const { mapName } = payload
    if (!isBoardMapName(mapName)) return ack({ outcome: 'INVALID_REQUEST' })
    const membership = context.registry.getActiveMembership(user.userId)
    if (membership) {
      const existing = context.registry.getCurrentLobby(user.userId)
      return ack(existing && existing.isMember(socket).isOk()
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existing.lobby) }
        : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
    }
    const lobby = new Lobby(payload.name, mapName, user, socket.id)
    new LobbySession(lobby).connect(socket)
    context.registry.addLobby(lobby)
    context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobby.lobbyId })
    ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
  })
}

export function handleJoinLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: LobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withValidatedRequest(socket, 'lobby.join', lobbyRequestSchema, payload, acknowledge, (user, ack) => {
    const session = context.registry.getLobby(payload.lobbyId)
    if (!session) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    const membership = context.registry.getActiveMembership(user.userId)
    if (membership) {
      return ack(membership.kind === 'lobby' && membership.lobbyId === session.lobby.lobbyId
        && session.isMember(socket).isOk()
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(session.lobby) }
        : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
    }
    if (session.lobby.isFull) return ack({ outcome: 'LOBBY_FULL' })
    session.join(socket)
    context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: session.lobby.lobbyId })
    ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(session.lobby) })
  })
}

export function handleLeaveLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyLeaveResult) => void,
): void {
  withValidatedRequest(socket, 'lobby.leave', emptyRequestSchema, payload, acknowledge, (_user, ack) => {
    const result = leaveLobby(context, socket)
    ack(result.isOk() ? { outcome: 'LEFT' } : { outcome: result.error })
  })
}

type ConnectedLobbyMember = { user: User; connectionId: string; socket: GameSocket }

function getConnectedMembers(context: SocketContext, lobby: Lobby): Result<ConnectedLobbyMember[], 'LOBBY_MEMBER_DISCONNECTED'> {
  const members: ConnectedLobbyMember[] = []
  for (const member of lobby.members) {
    const socket = context.io.sockets.sockets.get(member.connectionId)
    if (!socket?.connected) return err('LOBBY_MEMBER_DISCONNECTED')
    members.push({ ...member, socket })
  }
  return ok(members)
}

export function handleStartLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyStartResult) => void,
): void {
  const { io } = context
  withValidatedRequest(socket, 'lobby.start', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const session = context.registry.getCurrentLobby(user.userId)
    if (!session || session.isMember(socket).isErr()) return ack({ outcome: 'NOT_A_MEMBER' })
    const { lobby } = session
    if (lobby.ownerUserId !== user.userId) return ack({ outcome: 'NOT_LOBBY_OWNER' })

    const connected = getConnectedMembers(context, lobby)
    if (connected.isErr()) return ack({ outcome: connected.error })

    // The in-memory adapter joins synchronously. Prepare everything before publishing
    // or notifying clients; no event-loop yield can change the roster mid-transition.
    let gameContext: MembershipContext | undefined
    let prepared: { member: { user: User; player: Player }; socket: GameSocket; initialization: GameInitialization }[] = []
    try {
      const preparedContext = createGameContext(io, createGame(lobby.mapName, lobby.name))
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
        ...entry, initialization: presentInitialization(preparedContext.game, entry.member.player, state),
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
    context.registry.promoteLobbyToGame(session, gameContext, prepared.map((entry) => entry.member.user.userId))
    for (const entry of prepared) session.disconnect(entry.socket)
    for (const entry of prepared) {
      io.to(gameContext.playerRoom(entry.member.player.id)).emit('game.started', {
        lobbyId: lobby.lobbyId, initialization: entry.initialization,
      })
    }
    ack({ outcome: 'STARTED', gameId: gameContext.game.id })
  })
}
