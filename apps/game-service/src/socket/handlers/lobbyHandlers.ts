import { err, ok, type Result } from 'neverthrow'
import { Lobby } from '@/domain/lobby/Lobby'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { isBoardMapName } from '@/domain/game/boardMaps'
import { createGame } from '@/domain/game/GameFactory'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema, robotSelectionRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest, type RobotSelectionRequest,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult, type RobotSelectionResult,
} from '@robo-rally/game-events'
import { robotCatalog } from '@/domain/game/robotCatalog'
import { GameSession } from '@/socket/gameSession/GameSession'
import type { GameSocket, GameSocketServer, SocketContext } from '@/socket/gameServer'
import { LobbySession, type ConnectedLobbyMember } from '@/socket/LobbySession'
import { presentInitialization } from '@/socket/presenters/gamePresenter'
import { presentBoardMaps, presentLobby, presentLobbySummary } from '@/socket/presenters/lobbyPresenter'
import { logError } from '@/logger'

export function leaveLobby(context: SocketContext, socket: GameSocket): Result<void, 'NO_MEMBERSHIP' | 'NOT_A_MEMBER'> {
  const userId = socket.data.user.userId
  if (!context.registry.getActiveMembership(userId)) return err('NO_MEMBERSHIP')
  const lobbySession = context.registry.getCurrentLobby(userId)
  if (!lobbySession) return err('NOT_A_MEMBER')
  return lobbySession.isMember(socket).map(() => {
    lobbySession.leave(socket, context.io)
    dropMembership(context, lobbySession, userId)
  })
}

/** Runs on the reconnect-grace timer: an escaping throw there would take the process down. */
export function releaseExpiredSeat(context: SocketContext, lobbySession: LobbySession, userId: string): void {
  try {
    if (context.registry.getCurrentLobby(userId) !== lobbySession) return
    lobbySession.releaseSeat(userId, context.io)
    dropMembership(context, lobbySession, userId)
  } catch (error) {
    logError('Failed to release expired lobby seat', error, { userId })
  }
}

function dropMembership(context: SocketContext, lobbySession: LobbySession, userId: string): void {
  context.registry.clearActiveMembership(userId)
  if (lobbySession.lobby.size === 0) context.registry.removeLobby(lobbySession.lobby.lobbyId)
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
        lobbies: context.registry.lobbies.map((lobbySession) => presentLobbySummary(lobbySession.lobby)),
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
      ? ok({ user, mapName: data.mapName, name: data.name })
      : err({ outcome: 'INVALID_REQUEST' as const }),
    run: ({ user, mapName, name }, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (membership) {
        const existingLobbySession = context.registry.getCurrentLobby(user.userId)
        return ack(existingLobbySession && existingLobbySession.isMember(socket).isOk()
          ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existingLobbySession) }
          : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
      }
      // Seat the owner before registering anything, so a failed room join retains no lobby.
      const lobbySession = new LobbySession(new Lobby(name, mapName, user))
      lobbySession.attach(socket)
      context.registry.addLobby(lobbySession)
      context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobbySession.lobby.lobbyId })
      ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobbySession) })
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
      const lobbySession = context.registry.getLobby(data.lobbyId)
      return lobbySession ? ok({ user, lobbySession }) : err({ outcome: 'LOBBY_NOT_FOUND' as const })
    },
    run: ({ user, lobbySession }, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (membership) {
        return ack(membership.kind === 'lobby' && membership.lobbyId === lobbySession.lobby.lobbyId
          && lobbySession.isMember(socket).isOk()
          ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(lobbySession) }
          : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
      }
      if (lobbySession.lobby.isFull) return ack({ outcome: 'LOBBY_FULL' })
      lobbySession.join(socket)
      context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobbySession.lobby.lobbyId })
      ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobbySession) })
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
      const lobby = presentLobby(lobbySession)
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
      ack(result.isOk() || result.error === 'NO_MEMBERSHIP' ? { outcome: 'LEFT' } : { outcome: 'NOT_A_MEMBER' })
    },
  })
}

function startGame(io: GameSocketServer, lobby: Lobby, connectedMembers: ConnectedLobbyMember[]) {
  const gameSession = new GameSession(io, createGame(lobby.mapName, lobby.name))
  const seated = connectedMembers.map((member) => {
    const result = gameSession.addSeat(member.user, member.socket.id, member.robotSpriteId)
    if (result.isErr()) throw new Error(result.error)
    return { member, player: result.value }
  })
  const state = gameSession.publicState()
  const seatedMembers = seated.map(({ member, player }) => ({
    user: member.user, player, socket: member.socket,
    initialization: presentInitialization(gameSession.game, player, state),
  }))
  for (const seatedMember of seatedMembers) {
    for (const room of [gameSession.publicRoom, gameSession.playerRoom(seatedMember.player.id)]) {
      void seatedMember.socket.join(room)
    }
  }
  return { gameSession, seatedMembers }
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
      const lobbySession = context.registry.getCurrentLobby(user.userId)
      if (!lobbySession || lobbySession.isMember(socket).isErr()) return err({ outcome: 'NOT_A_MEMBER' as const })
      if (lobbySession.lobby.ownerUserId !== user.userId) return err({ outcome: 'NOT_LOBBY_OWNER' as const })
      const connectedResult = lobbySession.resolveConnectedMembers(context.io)
      if (connectedResult.isErr()) return err({ outcome: connectedResult.error })
      return ok({ lobbySession, connectedMembers: connectedResult.value })
    },
    run: ({ lobbySession, connectedMembers }, ack) => {
      const { lobby } = lobbySession
      const { gameSession, seatedMembers } = startGame(io, lobby, connectedMembers)
      for (const seatedMember of seatedMembers) lobbySession.leaveRoom(seatedMember.socket)
      context.registry.promoteLobbyToGame(lobbySession, gameSession, seatedMembers.map((seatedMember) => seatedMember.user.userId))
      for (const seatedMember of seatedMembers) {
        io.to(gameSession.playerRoom(seatedMember.player.id)).emit('game.started', {
          lobbyId: lobby.lobbyId, initialization: seatedMember.initialization,
        })
      }
      ack({ outcome: 'STARTED', gameId: gameSession.game.id })
    },
  })
}
