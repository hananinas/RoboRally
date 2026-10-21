import { registerLobbyHandlers, leaveLobby, presentLobby, defaultGameFactory, type SessionStore, type UserSession } from '@/lobbyHandlers'
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
import { createGameContext } from '@/gameContext'
import { handleLogin } from '@/authHandlers'
import {
  handleDisconnect,
  handleGetLobbyDetails,
  handleGetPublicGameState,
  handleJoin,
  handleLeave,
  reconnectIfRecovered,
} from '@/membershipHandlers'
import { handleSubmitProgram } from '@/gameplayHandlers'

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
  initialGames: GameSession | readonly GameSession[] = [],
  createGame: () => GameSession = defaultGameFactory,
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
  const games = new Map((Array.isArray(initialGames) ? initialGames : [initialGames]).map((session: GameSession) =>
    [session.gameId, createGameContext(io, session)]))
  const sessionsByUser = new Map<string, UserSession>()
  const store: SessionStore = { games, sessionsByUser, lobbies: new Map(), createGame }
  const currentGame = (socket: GameSocket) => {
    const session = sessionsByUser.get(socket.data.user?.userId ?? '')
    return session?.kind === 'game' ? games.get(session.gameId) : undefined
  }
  const requestedGame = (payload: { gameId: string }) => games.get(payload?.gameId)
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
      handleJoin(ctx, socket, { gameId: ctx.gameId }, (result) => {
        if (result.outcome === 'JOINED') acknowledge({ outcome: 'IN_GAME', initialization: result })
        else acknowledge({ outcome: result.outcome === 'USER_ALREADY_IN_GAME' ? 'USER_ALREADY_IN_SESSION' : 'INTERNAL_ERROR' })
      })
    })

    socket.on('game.join', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = requestedGame(payload)
      if (!ctx) return acknowledge({ outcome: socket.data.user ? 'GAME_NOT_FOUND' : 'LOGIN_REQUIRED' })
      const existing = sessionsByUser.get(socket.data.user?.userId ?? '')
      if (existing && (existing.kind !== 'game' || existing.gameId !== ctx.gameId)) return acknowledge({ outcome: 'USER_ALREADY_IN_GAME' })
      handleJoin(ctx, socket, payload, (result) => {
        if (result.outcome === 'JOINED') sessionsByUser.set(socket.data.user!.userId, { kind: 'game', gameId: ctx.gameId })
        acknowledge(result)
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
    socket.on('game.getLobbyDetails', (payload, acknowledge) => {
      const ctx = games.values().next().value
      if (ctx) handleGetLobbyDetails(ctx, socket, payload, acknowledge)
    })
    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(socket)
      if (ctx) handleGetPublicGameState(ctx, socket, payload, acknowledge)
      else acknowledge({ outcome: 'GAME_NOT_FOUND' })
    })
    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const ctx = currentGame(socket)
      if (ctx) handleSubmitProgram(ctx, socket, payload, acknowledge)
      else acknowledge({ outcome: 'INVALID_PROGRAM' })
    })
  })

  return io
}
