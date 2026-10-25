import type { Server as HttpServer } from 'node:http'
import { leaveGameSchema, type ClientToServerEvents, type LeaveResult, type ServerToClientEvents, type User } from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import type { Game } from '@/game/index'
import {
  presentPlayerStates, presentPublicGameState, presentPublicStateUpdate,
} from '@/socket/gamePresenter'
import { createUserRegistry } from '@/userRegistry'
import { createGame } from '@/game/GameFactory'
import { createActionScheduler } from '@/actionScheduler'
import { handleLogin } from '@/socket/handlers/authHandlers'
import {
  handleDisconnect, handleLeave, reconnectIfRecovered,
  type GameMembership, type MembershipContext,
} from '@/socket/handlers/membershipHandlers'
import {
  findGame, handleLobbyList, handleLobbyJoin, handleLobbyLeave, handleLobbyStart, handleSessionGet,
  removeWaitingMember, type LobbyContext,
} from '@/socket/handlers/lobbyHandlers'
import { handleSubmitProgram, handleUpdateRegisters } from '@/socket/handlers/gameplayHandlers'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import { authorizeGameRecovery } from '@/socket/gameRecovery'

export type GameSocketData = { user?: User }
export type GameSocketServer = Server<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>
export type GameSession = Readonly<{ gameId: string; game: Game }>

export function createGameSocketServer(
  httpServer: HttpServer,
  factory: () => GameSession = () => createGame(),
): GameSocketServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>(httpServer, {
    connectionStateRecovery: { skipMiddlewares: false },
    pingInterval: 1000,
    pingTimeout: 1000,
  })
  const users = createUserRegistry()
  const lifecycle: LobbyContext = {
    lobbies: new Map(),
    games: new Map(),
    createGameContext: () => {
      const { gameId, game } = factory()
      const publicRoom = `game:${gameId}:public`
      const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
      const memberships = new Map<string, GameMembership>()
      const playerStates = () => presentPlayerStates(game, [...memberships.values()])
      const publicState = () => presentPublicGameState(gameId, game, playerStates())
      // Registers belong to the game state the service shares, so register
      // changes travel with it instead of a per-player event.
      const broadcastPublicState = () => {
        io.to(publicRoom).emit('game.updated', {
          gameId,
          state: presentPublicStateUpdate(gameId, game, playerStates()),
        })
      }
      const actionScheduler = createActionScheduler({
        io, game, gameId, publicRoom, playerRoom, broadcastPublicState,
      })
      return {
        io, game, gameId, publicRoom, playerRoom, memberships, actionScheduler,
        publicState, broadcastPublicState,
      }
    },
  }

  httpServer.once('close', () => {
    for (const game of lifecycle.games.values()) game.actionScheduler.stop()
  })

  authorizeGameRecovery(io, (userId) => findGame(lifecycle, userId))

  io.on('connection', (socket) => {
    socket.on('user.login', (payload, acknowledge) => handleLogin(socket, { users }, payload, acknowledge))
    const recoveredGame = socket.data.user && findGame(lifecycle, socket.data.user.userId)
    if (recoveredGame) reconnectIfRecovered(recoveredGame, socket)

    socket.on('lobby.list', (payload, acknowledge) => handleLobbyList(lifecycle, socket, payload, acknowledge))
    socket.on('lobby.create', (payload, acknowledge) => handleLobbyJoin(lifecycle, socket, payload, acknowledge, true))
    socket.on('lobby.join', (payload, acknowledge) => handleLobbyJoin(lifecycle, socket, payload, acknowledge))
    socket.on('lobby.leave', (payload, acknowledge) => handleLobbyLeave(lifecycle, socket, payload, acknowledge))
    socket.on('lobby.start', (payload, acknowledge) => handleLobbyStart(lifecycle, socket, payload, acknowledge))
    socket.on('session.get', (payload, acknowledge) => handleSessionGet(lifecycle, socket, payload, acknowledge))
    socket.on('game.leave', (payload, acknowledge) => {
      const game = socket.data.user && findGame(lifecycle, socket.data.user.userId)
      if (game) {
        handleLeave(game, socket, payload, acknowledge)
        return
      }
      withAcknowledgeOnce<LeaveResult>(acknowledge, (ack) => {
        ack({ outcome: !socket.data.user ? 'LOGIN_REQUIRED'
          : !leaveGameSchema.safeParse(payload).success ? 'INVALID_REQUEST' : 'GAME_NOT_FOUND' })
      }, () => ({ outcome: 'INTERNAL_ERROR' } as const))
    })
    socket.on('program.submit', (payload, acknowledge) => {
      const game = socket.data.user && findGame(lifecycle, socket.data.user.userId)
      if (game) handleSubmitProgram(game, socket, payload, acknowledge)
      else if (typeof acknowledge === 'function') acknowledge({ outcome: 'NOT_A_MEMBER' })
    })
    socket.on('game.updateRegisters', (payload, acknowledge) => {
      const game = socket.data.user && findGame(lifecycle, socket.data.user.userId)
      if (game) handleUpdateRegisters(game, socket, payload, acknowledge)
      else if (typeof acknowledge === 'function') acknowledge({ outcome: 'NOT_A_MEMBER' })
    })
    socket.on('disconnect', () => {
      removeWaitingMember(lifecycle, socket)
      const game: MembershipContext | undefined = socket.data.user ? findGame(lifecycle, socket.data.user.userId) : undefined
      if (game) handleDisconnect(game, socket)
    })
  })
  return io
}
