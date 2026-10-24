import { handleListLobbies, handleCreateLobby, handleJoinLobby, handleLeaveLobby, handleStartLobby, leaveLobby } from '@/socket/handlers/lobbyHandlers'
import { handleGetSession } from '@/socket/handlers/sessionHandlers'
import { currentGame, type SessionContext } from '@/socket/sessionContext'
import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import type { Game } from '@/game/index'
import { createUserRegistry } from '@/userRegistry'
import { createDefaultGame } from '@/game/GameFactory'
import { handleLogin } from '@/socket/handlers/authHandlers'
import {
  handleDisconnect,
  handleLeave,
  reconnectIfRecovered,
} from '@/socket/handlers/membershipHandlers'
import { handleSubmitProgram } from '@/socket/handlers/gameplayHandlers'

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{ gameId: string; game: Game }>

export function createGameSocketServer(
  httpServer: HttpServer,
  createGame: () => GameSession = createDefaultGame,
): GameSocketServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    {},
    GameSocketData
  >(httpServer, {
    connectionStateRecovery: { skipMiddlewares: false },
    pingInterval: 1000,
    pingTimeout: 1000,
  })
  const users = createUserRegistry()
  const context: SessionContext = {
    io, createGame, games: new Map(), lobbies: new Map(), sessionsByUser: new Map(),
  }
  httpServer.once('close', () => { for (const ctx of context.games.values()) ctx.actionScheduler.stop() })

  io.use((socket, next) => {
    if (socket.recovered && socket.data.user) {
      const ctx = currentGame(context, socket)
      const membership = ctx?.memberships.get(socket.data.user.userId)
      if (membership?.connectionId && membership.connectionId !== socket.id) {
        next(new Error('USER_ALREADY_IN_GAME'))
        return
      }
      const expectedRooms = new Set(membership && ctx
        ? [socket.id, ctx.publicRoom, ctx.playerRoom(membership.player.id)] : [socket.id])
      if ([...socket.rooms].some((room) => !expectedRooms.has(room))) {
        next(new Error('SESSION_EXPIRED'))
        return
      }
    }
    next()
  })

  io.on('connection', (socket) => {
    socket.on('user.login', (payload, acknowledge) => handleLogin(socket, { users }, payload, acknowledge))

    const recoveredGame = currentGame(context, socket)
    if (recoveredGame) reconnectIfRecovered(recoveredGame, socket)

    socket.on('lobby.list', (payload, ack) => handleListLobbies(context, socket, payload, ack))
    socket.on('lobby.create', (payload, ack) => handleCreateLobby(context, socket, payload, ack))
    socket.on('lobby.join', (payload, ack) => handleJoinLobby(context, socket, payload, ack))
    socket.on('lobby.leave', (payload, ack) => handleLeaveLobby(context, socket, payload, ack))
    socket.on('lobby.start', (payload, ack) => handleStartLobby(context, socket, payload, ack))
    socket.on('session.get', (payload, ack) => handleGetSession(context, socket, payload, ack))

    socket.on('game.leave', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(context, socket)
      if (!ctx) return acknowledge({ outcome: socket.data.user ? 'GAME_NOT_FOUND' : 'LOGIN_REQUIRED' })
      handleLeave(ctx, socket, payload, (result) => {
        if (result.outcome === 'LEFT') context.sessionsByUser.delete(socket.data.user!.userId)
        acknowledge(result)
      })
      if (ctx.memberships.size === 0) {
        ctx.actionScheduler.stop()
        context.games.delete(ctx.gameId)
      }
    })
    socket.on('disconnect', () => {
      leaveLobby(context, socket)
      const ctx = currentGame(context, socket)
      if (ctx) handleDisconnect(ctx, socket)
    })
    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(context, socket)
      if (ctx) handleSubmitProgram(ctx, socket, payload, acknowledge)
      else acknowledge({ outcome: 'NOT_A_MEMBER' })
    })
  })

  return io
}
