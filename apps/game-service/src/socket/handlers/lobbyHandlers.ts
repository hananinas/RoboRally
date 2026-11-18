import { err, ok, type Result } from 'neverthrow'
import type { Player } from '@/domain/game/Player'
import { Lobby } from '@/domain/lobby/Lobby'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { ROBOT_COLOURS } from '@/domain/game/Robot'
import { boardMaps, type BoardMapName } from '@/domain/game/boardMaps'
import { createGame } from '@/domain/game/GameFactory'
import {
  emptyRequestSchema, lobbyRequestSchema, createLobbyRequestSchema,
  type EmptyRequest, type LobbyRequest, type CreateLobbyRequest, type GameInitialization, type LobbyState, type User,
  type LobbyListResult, type LobbyJoinResult, type LobbyLeaveResult, type LobbyStartResult,
} from '@robo-rally/game-events'
import { createGameContext } from '@/socket/gameSession/gameContext'
import { presentInitialization, type MembershipContext } from '@/socket/gameSession/gameMembership'
import type { GameSocket, SocketContext } from '@/socket/gameServer'

const lobbyRoom = (id: string) => `lobby:${id}`
export function presentLobby(lobby: Lobby): LobbyState {
  const map = boardMaps[lobby.mapName]
  return { lobbyId: lobby.lobbyId, name: lobby.name, mapName: lobby.mapName, mapDisplayName: map.name, mapIcon: map.icon,
    ownerUserId: lobby.ownerUserId,
    playerCount: lobby.size, maxPlayers: Lobby.MAX_PLAYERS,
    players: lobby.members.map(({ user }) => ({ userId: user.userId, username: user.username })) }
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

export function leaveLobby(context: SocketContext, socket: GameSocket): void {
  const userId = socket.data.user.userId
  const lobby = context.registry.getCurrentLobby(userId)
  if (!lobby || lobby.getMember(userId)?.connectionId !== socket.id) return
  lobby.removeMember(userId)
  context.registry.clearActiveMembership(userId)
  void socket.leave(lobbyRoom(lobby.lobbyId))
  if (lobby.size === 0) context.registry.removeLobby(lobby.lobbyId)
  else {
    context.io.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  }
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
      lobbies: context.registry.lobbies.map((lobby) => {
        const { lobbyId, name, mapName, mapDisplayName, mapIcon, playerCount, maxPlayers } = presentLobby(lobby)
        return { lobbyId, name, mapName, mapDisplayName, mapIcon, playerCount, maxPlayers }
      }),
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
    const mapName = payload.mapName ?? defaultLobbyMapName()
    if (!isBoardMapName(mapName)) return ack({ outcome: 'INVALID_REQUEST' })
    const membership = context.registry.getActiveMembership(user.userId)
    if (membership) {
      const existing = context.registry.getCurrentLobby(user.userId)
      return ack(existing?.getMember(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(existing) }
        : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
    }
    const lobby = new Lobby(payload.name, mapName, user, socket.id)
    void socket.join(lobbyRoom(lobby.lobbyId))
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
    const lobby = context.registry.getLobby(payload.lobbyId)
    if (!lobby) return ack({ outcome: 'LOBBY_NOT_FOUND' })
    const membership = context.registry.getActiveMembership(user.userId)
    if (membership) {
      return ack(membership.kind === 'lobby' && membership.lobbyId === lobby.lobbyId
        && lobby.getMember(user.userId)?.connectionId === socket.id
        ? { outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) }
        : { outcome: 'ALREADY_HAS_MEMBERSHIP' })
    }
    if (lobby.isFull) return ack({ outcome: 'LOBBY_FULL' })
    void socket.join(lobbyRoom(lobby.lobbyId))
    lobby.addMember(user, socket.id)
    context.registry.setActiveMembership(user.userId, { kind: 'lobby', lobbyId: lobby.lobbyId })
    ack({ outcome: 'LOBBY_JOINED', lobby: presentLobby(lobby) })
    socket.to(lobbyRoom(lobby.lobbyId)).emit('lobby.updated', { lobby: presentLobby(lobby) })
  })
}

export function handleLeaveLobby(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LobbyLeaveResult) => void,
): void {
  withValidatedRequest(socket, 'lobby.leave', emptyRequestSchema, payload, acknowledge, (user, ack) => {
    const membership = context.registry.getActiveMembership(user.userId)
    if (!membership) return ack({ outcome: 'LEFT' })
    const lobby = membership.kind === 'lobby' ? context.registry.getLobby(membership.lobbyId) : undefined
    if (lobby?.getMember(user.userId)?.connectionId !== socket.id) {
      return ack({ outcome: 'NOT_LOBBY_MEMBER' })
    }
    leaveLobby(context, socket)
    ack({ outcome: 'LEFT' })
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
    const activeMembership = context.registry.getActiveMembership(user.userId)
    const lobby = activeMembership?.kind === 'lobby' ? context.registry.getLobby(activeMembership.lobbyId) : undefined
    if (!lobby || lobby.getMember(user.userId)?.connectionId !== socket.id) return ack({ outcome: 'NOT_LOBBY_MEMBER' })
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
    context.registry.promoteLobbyToGame(lobby, gameContext, prepared.map((entry) => entry.member.user.userId))
    for (const entry of prepared) void entry.socket.leave(lobbyRoom(lobby.lobbyId))
    for (const entry of prepared) {
      io.to(gameContext.playerRoom(entry.member.player.id)).emit('game.started', {
        lobbyId: lobby.lobbyId, initialization: entry.initialization,
      })
    }
    ack({ outcome: 'STARTED', gameId: gameContext.game.id })
  })
}
