import { err, ok, type Result } from 'neverthrow'
import type { Player } from '@/domain/game/Player'
import { Lobby } from '@/domain/lobby/Lobby'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { isBoardMapName } from '@/domain/game/boardMaps'
import { createGame } from '@/domain/game/GameFactory'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema, robotSelectionRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest, type RobotSelectionRequest, type RobotSelectionResult, type GameInitialization, type User,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult,
} from '@robo-rally/game-events'
import { robotCatalog } from '@/domain/game/robotCatalog'
import { GameSession } from '@/socket/gameSession/GameSession'
import type { GameSocket, GameSocketServer, SocketContext } from '@/socket/gameServer'
import { LobbySession, type ConnectedLobbyMember } from '@/socket/LobbySession'
import { presentInitialization } from '@/socket/presenters/gamePresenter'
import { presentBoardMaps, presentLobby, presentLobbySummary } from '@/socket/presenters/lobbyPresenter'

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
  withValidatedRequest({
    socket, command: 'lobby.list', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => ok(user),
    run: (_user, ack) => {
      ack({
        outcome: 'LOBBIES_FOUND',
        maps: presentBoardMaps(),
        robots: robotCatalog,
        lobbies: context.registry.lobbies.map((session) => presentLobbySummary(session.lobby)),
      })
    },
  })
}

export function handleCreateLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: CreateLobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'lobby.create', schema: createLobbyRequestSchema, payload, acknowledge,
    resolve: (user, data) => isBoardMapName(data.mapName)
      ? ok({ user, mapName: data.mapName })
      : err({ outcome: 'INVALID_REQUEST' as const }),
    run: ({ user, mapName }, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (membership) {
        const existing = context.registry.getCurrentLobby(user.userId)
        return ack(existing && existing.isMember(socket).isOk()
          ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existing.lobby) }
          : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
      }
      const lobby = new Lobby(payload.name, mapName, user, socket.id)
      void socket.join(LobbySession.roomFor(lobby.lobbyId))
      context.registry.addLobby(lobby)
      context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobby.lobbyId })
      ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
    },
  })
}

export function handleJoinLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: LobbyRequest,
  acknowledge: (result: LobbyJoinResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'lobby.join', schema: lobbyRequestSchema, payload, acknowledge,
    resolve: (user, data) => {
      const session = context.registry.getLobby(data.lobbyId)
      return session ? ok({ user, session }) : err({ outcome: 'LOBBY_NOT_FOUND' as const })
    },
    run: ({ user, session }, ack) => {
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
    },
  })
}

export function handleSelectRobot(
  context: SocketContext,
  socket: GameSocket,
  payload: RobotSelectionRequest,
  acknowledge: (result: RobotSelectionResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'lobby.selectRobot', schema: robotSelectionRequestSchema, payload, acknowledge,
    resolve: (user, data) => {
      if (!robotCatalog.some((robot) => robot.id === data.robotSpriteId)) {
        return err({ outcome: 'INVALID_REQUEST' as const })
      }
      const lobbySession = context.registry.getCurrentLobby(user.userId)
      if (!lobbySession || lobbySession.isMember(socket).isErr()) return err({ outcome: 'NOT_A_MEMBER' as const })
      return ok({ user, lobbySession, robotSpriteId: data.robotSpriteId })
    },
    run: ({ user, lobbySession, robotSpriteId }, ack) => {
      lobbySession.lobby.selectRobot(user.userId, robotSpriteId)
      const lobby = presentLobby(lobbySession.lobby)
      ack({ outcome: 'ROBOT_SELECTED', lobby })
      socket.to(lobbySession.room).emit('lobby.updated', { lobby })
    },
  })
}

export function handleLeaveLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyLeaveResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'lobby.leave', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => ok(user),
    run: (_user, ack) => {
      const result = leaveLobby(context, socket)
      ack(result.isOk() ? { outcome: 'LEFT' } : { outcome: result.error })
    },
  })
}

type PreparedMember = { member: { user: User; player: Player }; socket: GameSocket; initialization: GameInitialization }

function startGame(
  io: GameSocketServer,
  lobby: Lobby,
  connected: ConnectedLobbyMember[],
): { gameSession: GameSession; prepared: PreparedMember[] } {
  // The in-memory adapter joins synchronously. Prepare everything before publishing
  // or notifying clients; no event-loop yield can change the roster mid-transition.
  let gameSession: GameSession | undefined
  let prepared: PreparedMember[] = []
  try {
    const session = new GameSession(io, createGame(lobby.mapName, lobby.name))
    gameSession = session
    const members = connected.map(({ socket: connection, ...member }) => {
      const result = session.game.addPlayer(undefined, member.robotSpriteId)
      if (result.isErr()) throw new Error(result.error)
      const membership = { ...member, player: result.value }
      session.memberships.set(member.user.userId, membership)
      return { member: membership, socket: connection }
    })
    const state = session.publicState()
    prepared = members.map((entry) => ({
      ...entry, initialization: presentInitialization(session.game, entry.member.player, state),
    }))
    for (const entry of prepared) {
      for (const room of [gameSession.publicRoom, gameSession.playerRoom(entry.member.player.id)]) {
        void entry.socket.join(room)
      }
    }
    return { gameSession, prepared }
  } catch (error) {
    if (gameSession) {
      for (const { socket: connection, member } of prepared) {
        void connection.leave(gameSession.publicRoom)
        void connection.leave(gameSession.playerRoom(member.player.id))
      }
    }
    gameSession?.actionScheduler.stop()
    throw error
  }
}

export function handleStartLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyStartResult) => void,
): void {
  const { io } = context
  withValidatedRequest({
    socket, command: 'lobby.start', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => {
      const session = context.registry.getCurrentLobby(user.userId)
      if (!session || session.isMember(socket).isErr()) return err({ outcome: 'NOT_A_MEMBER' as const })
      if (session.lobby.ownerUserId !== user.userId) return err({ outcome: 'NOT_LOBBY_OWNER' as const })
      const connected = session.resolveConnectedMembers(context.io)
      if (connected.isErr()) return err({ outcome: connected.error })
      return ok({ session, connected: connected.value })
    },
    run: ({ session, connected }, ack) => {
      const { lobby } = session
      const { gameSession, prepared } = startGame(io, lobby, connected)
      for (const entry of prepared) session.disconnect(entry.socket)
      context.registry.promoteLobbyToGame(session, gameSession, prepared.map((entry) => entry.member.user.userId))
      for (const entry of prepared) {
        io.to(gameSession.playerRoom(entry.member.player.id)).emit('game.started', {
          lobbyId: lobby.lobbyId, initialization: entry.initialization,
        })
      }
      ack({ outcome: 'STARTED', gameId: gameSession.game.id })
    },
  })
}
