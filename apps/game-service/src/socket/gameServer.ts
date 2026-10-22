import { registerLobbyHandlers, leaveLobby, presentLobby, type SessionStore, type UserSession } from '@/socket/handlers/lobbyHandlers'
import type { Server as HttpServer } from 'node:http'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  User,
} from '@robo-rally/game-events'
import { emptyRequestSchema } from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import type { Game } from '@/game/index'
import { createUserRegistry } from '@/userRegistry'
import { createDefaultGame } from '@/game/GameFactory'
import type { MembershipContext } from '@/socket/handlers/membershipHandlers'
import { handleLogin } from '@/socket/handlers/authHandlers'
import {
  handleDisconnect,
  reattachGame,
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
  const games = new Map<string, MembershipContext>()
  const sessionsByUser = new Map<string, UserSession>()
  const store: SessionStore = { games, sessionsByUser, lobbies: new Map(), createGame }
  const currentGame = (socket: GameSocket) => {
    const session = sessionsByUser.get(socket.data.user?.userId ?? '')
    return session?.kind === 'game' ? games.get(session.gameId) : undefined
  }
  httpServer.once('close', () => { for (const ctx of games.values()) ctx.actionScheduler.stop() })

  io.use((socket, next) => {
    if (socket.recovered && socket.data.user) {
      const ctx = currentGame(socket)
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
    registerLobbyHandlers(io, store, socket)
    socket.on('user.login', (payload, acknowledge) => handleLogin(socket, { users }, payload, acknowledge))

    const recoveredGame = currentGame(socket)
    if (recoveredGame) reconnectIfRecovered(recoveredGame, socket)

    socket.on('session.get', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      if (!socket.data.user) return acknowledge({ outcome: 'LOGIN_REQUIRED' })
      if (!emptyRequestSchema.safeParse(payload).success) return acknowledge({ outcome: 'INVALID_REQUEST' })
      const userId = socket.data.user.userId
      const session = sessionsByUser.get(userId)
      if (!session) return acknowledge({ outcome: 'NO_SESSION' })
      if (session.kind === 'lobby') {
        const lobby = store.lobbies.get(session.lobbyId)!
        return acknowledge(lobby.members.get(userId)?.connectionId === socket.id
          ? { outcome: 'IN_LOBBY', lobby: presentLobby(lobby) }
          : { outcome: 'USER_ALREADY_IN_SESSION' })
      }
      const ctx = games.get(session.gameId)!
      reattachGame(ctx, socket, (result) => {
        if (result.outcome === 'JOINED') acknowledge({ outcome: 'IN_GAME', initialization: result })
        else acknowledge({ outcome: result.outcome === 'USER_ALREADY_IN_GAME' ? 'USER_ALREADY_IN_SESSION' : 'INTERNAL_ERROR' })
      })
    })

    socket.on('game.leave', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(socket)
      if (!ctx) return acknowledge({ outcome: socket.data.user ? 'GAME_NOT_FOUND' : 'LOGIN_REQUIRED' })
      handleLeave(ctx, socket, payload, (result) => {
        if (result.outcome === 'LEFT') sessionsByUser.delete(socket.data.user!.userId)
        acknowledge(result)
      })
      if (ctx.memberships.size === 0) {
        ctx.actionScheduler.stop()
        games.delete(ctx.gameId)
      }
    })
    socket.on('disconnect', () => {
      leaveLobby(io, store, socket)
      const ctx = currentGame(socket)
      if (ctx) handleDisconnect(ctx, socket)
    })
    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(socket)
      if (ctx) handleSubmitProgram(ctx, socket, payload, acknowledge)
      else acknowledge({ outcome: 'NOT_A_MEMBER' })
    })
  })

  return io
}
