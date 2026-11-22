import { err, ok, type Result } from 'neverthrow'
import { Lobby } from '@/domain/lobby/Lobby'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { isBoardMapName } from '@/domain/game/boardMaps'
import { createGame } from '@/domain/game/GameFactory'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult,
} from '@robo-rally/game-events'
import { GameSession } from '@/socket/gameSession/GameSession'
import type { GameSocket, GameSocketServer, SocketContext } from '@/socket/gameServer'
import { LobbySession, type ConnectedLobbyMember } from '@/socket/LobbySession'
import { presentInitialization } from '@/socket/presenters/gamePresenter'
import { presentBoardMaps, presentLobby, presentLobbySummary } from '@/socket/presenters/lobbyPresenter'

export function leaveLobby(context: SocketContext, socket: GameSocket): Result<void, 'NOT_A_MEMBER'> {
  const userId = socket.data.user.userId
  const lobbySession = context.registry.getCurrentLobby(userId)
  if (!lobbySession) return err('NOT_A_MEMBER')
  return lobbySession.isMember(socket).map(() => {
    lobbySession.leave(socket)
    context.registry.clearActiveMembership(userId)
    if (lobbySession.lobby.size === 0) context.registry.removeLobby(lobbySession.lobby.lobbyId)
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
      ? ok({ user, mapName: data.mapName })
      : err({ outcome: 'INVALID_REQUEST' as const }),
    run: ({ user, mapName }, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (membership) {
        const existingLobbySession = context.registry.getCurrentLobby(user.userId)
        return ack(existingLobbySession && existingLobbySession.isMember(socket).isOk()
          ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existingLobbySession.lobby) }
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
      const lobbySession = context.registry.getLobby(data.lobbyId)
      return lobbySession ? ok({ user, lobbySession }) : err({ outcome: 'LOBBY_NOT_FOUND' as const })
    },
    run: ({ user, lobbySession }, ack) => {
      const membership = context.registry.getActiveMembership(user.userId)
      if (membership) {
        return ack(membership.kind === 'lobby' && membership.lobbyId === lobbySession.lobby.lobbyId
          && lobbySession.isMember(socket).isOk()
          ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(lobbySession.lobby) }
          : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
      }
      if (lobbySession.lobby.isFull) return ack({ outcome: 'LOBBY_FULL' })
      lobbySession.join(socket)
      context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobbySession.lobby.lobbyId })
      ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobbySession.lobby) })
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

function startGame(io: GameSocketServer, lobby: Lobby, connected: ConnectedLobbyMember[]) {
  const gameSession = new GameSession(io, createGame(lobby.mapName, lobby.name))
  for (const { user, connectionId } of connected) {
    const result = gameSession.addSeat(user, connectionId)
    if (result.isErr()) throw new Error(result.error)
  }
  const state = gameSession.publicState()
  const seatedMembers = connected.map(({ user, socket }) => {
    const { player } = gameSession.seats.get(user.userId)!
    return { user, player, socket, initialization: presentInitialization(gameSession.game, player, state) }
  })
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
      const connected = lobbySession.resolveConnectedMembers(context.io)
      if (connected.isErr()) return err({ outcome: connected.error })
      return ok({ lobbySession, connected: connected.value })
    },
    run: ({ lobbySession, connected }, ack) => {
      const { lobby } = lobbySession
      const { gameSession, seatedMembers } = startGame(io, lobby, connected)
      for (const seatedMember of seatedMembers) lobbySession.disconnect(seatedMember.socket)
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
