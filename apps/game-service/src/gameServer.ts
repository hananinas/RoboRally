import type { Server as HttpServer } from 'node:http'
import {
  LobbyRequestError,
  parseCreateLobby,
  parseGetPublicGameState,
  parseJoinGame,
  parseJoinLobby,
  LoginRequestError,
  parseLogin,
  parseSubmitProgram,
  type ClientToServerEvents,
  type ProgramCardIds,
  type ServerToClientEvents,
  type User,
} from '@robo-rally/game-events'
import { Server, type Socket } from 'socket.io'
import {
  createSinglePlayerGame,
  type Card,
  type Game,
  type Player,
} from '@/game/index'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from '@/gamePresenter'
import { createUserRegistry } from '@/userRegistry'
import { createLobbyRegistry } from './lobbyRegistry.js'

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>

export type GameSession = Readonly<{
  gameId: string
  game: Game
  playerForConnection: (socket: GameSocket) => Player | undefined
}>

export type GameSocketServerOptions = Readonly<{
  lobbyCapacity?: number
  lobbyCountdownMs?: number
}>

const DEFAULT_LOBBY_CAPACITY = 6
const DEFAULT_LOBBY_COUNTDOWN_MS = 5_000

function defaultSession(): GameSession {
  const { gameId, game, player } = createSinglePlayerGame()
  return { gameId, game, playerForConnection: () => player }
}

function publicRoom(gameId: string): string {
  return `game:${gameId}:public`
}

function playerRoom(gameId: string, playerId: string): string {
  return `game:${gameId}:player:${playerId}`
}

function resolveProgram(
  player: Player,
  cardIds: ProgramCardIds,
): readonly Card[] | undefined {
  const hand = new Map(player.hand.map((card) => [card.id, card]))
  const program: Card[] = []
  for (const cardId of cardIds) {
    const card = hand.get(cardId)
    if (!card) return undefined
    program.push(card)
  }
  return program
}

export function createGameSocketServer(
  httpServer: HttpServer,
  session: GameSession = defaultSession(),
  options: GameSocketServerOptions = {},
): GameSocketServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>(httpServer)
  const users = createUserRegistry()
  const lobbies = createLobbyRegistry(
    options.lobbyCapacity ?? DEFAULT_LOBBY_CAPACITY,
    options.lobbyCountdownMs ?? DEFAULT_LOBBY_COUNTDOWN_MS,
  )
  const { gameId, game, playerForConnection } = session
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false

  function scheduleNextAction(): void {
    if (closed || game.phase !== 'activation' || scheduledAction) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed) return
      const result = game.executeNextAction()
      io.to(publicRoom(gameId)).emit(
        'robot.actionResolved',
        presentRobotActionResolved(gameId, result),
      )
      if (game.phase === 'activation') {
        scheduleNextAction()
      } else {
        for (const player of game.players) {
          io.to(playerRoom(gameId, player.id)).emit(
            'cards.dealt',
            presentCardsDealt(gameId, player),
          )
        }
      }
    })
  }

  function publishLobbyList(): void {
    io.emit('lobby.listUpdated', lobbies.list())
  }

  httpServer.once('close', () => {
    closed = true
    clearImmediate(scheduledAction)
  })

  io.on('connection', (socket) => {
    const player = playerForConnection(socket)
    if (!player || !game.players.includes(player)) {
      socket.disconnect(true)
      return
    }
    socket.join([publicRoom(gameId), playerRoom(gameId, player.id)])

    socket.on('game.join', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      if (!socket.data.user) {
        acknowledge({ outcome: 'LOGIN_REQUIRED' })
        return
      }

      let request: ReturnType<typeof parseJoinGame>
      try {
        request = parseJoinGame(payload)
      } catch {
        acknowledge({ outcome: 'INVALID_REQUEST' })
        return
      }
      if (request.gameId !== gameId) {
        acknowledge({ outcome: 'GAME_NOT_FOUND' })
        return
      }
      if (game.phase === 'activation') {
        acknowledge({ outcome: 'GAME_ALREADY_STARTED' })
        return
      }

      acknowledge({
        outcome: 'JOINED',
        assignment: { gameId, playerId: player.id, robotId: player.robot.id },
        state: presentPublicGameState(gameId, game),
        hand: presentCardsDealt(gameId, player).cards,
        programSubmitted: game.hasSubmittedProgram(player.id),
      })
    })

    socket.on('user.login', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      let username: string
      try {
        username = parseLogin(payload).username
      } catch (error) {
        acknowledge({
          outcome:
            error instanceof LoginRequestError ? error.outcome : 'INTERNAL_ERROR',
        })
        return
      }

      if (socket.data.user) {
        acknowledge(
          socket.data.user.username === username
            ? { outcome: 'LOGGED_IN', user: socket.data.user }
            : { outcome: 'ALREADY_LOGGED_IN' },
        )
        return
      }

      try {
        const user = users.findOrCreate(username)
        socket.data.user = user
        acknowledge({ outcome: 'LOGGED_IN', user })
      } catch {
        acknowledge({ outcome: 'INTERNAL_ERROR' })
      }
    })

    socket.on('lobby.list', (acknowledge) => {
      if (typeof acknowledge !== 'function') return
      acknowledge(socket.data.user
        ? { outcome: 'LOBBIES_LISTED', lobbies: lobbies.list() }
        : { outcome: 'LOGIN_REQUIRED' })
    })

    socket.on('lobby.create', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const user = socket.data.user
      if (!user) {
        acknowledge({ outcome: 'LOGIN_REQUIRED' })
        return
      }

      try {
        const request = parseCreateLobby(payload)
        const result = lobbies.create(user, request)
        if ('error' in result) {
          acknowledge({ outcome: result.error })
          return
        }
        acknowledge({ outcome: 'LOBBY_CREATED', lobby: result.lobby })
        publishLobbyList()
      } catch (error) {
        acknowledge({
          outcome: error instanceof LobbyRequestError ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        })
      }
    })

    socket.on('lobby.join', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const user = socket.data.user
      if (!user) {
        acknowledge({ outcome: 'LOGIN_REQUIRED' })
        return
      }

      try {
        const request = parseJoinLobby(payload)
        const result = lobbies.join(user, request.code)
        if ('error' in result) {
          acknowledge({ outcome: result.error })
          return
        }
        acknowledge({ outcome: 'LOBBY_JOINED', lobby: result.lobby })
        publishLobbyList()
      } catch (error) {
        acknowledge({
          outcome: error instanceof LobbyRequestError ? 'INVALID_REQUEST' : 'INTERNAL_ERROR',
        })
      }
    })

    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const request = parseGetPublicGameState(payload)
        if (request.gameId === gameId) {
          acknowledge({
            outcome: 'GAME_FOUND',
            state: presentPublicGameState(gameId, game),
          })
          return
        }
      } catch {
        // Invalid requests receive the same non-disclosing result as unknown games.
      }

      acknowledge({ outcome: 'GAME_NOT_FOUND' })
    })

    socket.on('program.submit', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (
          submission.gameId !== gameId ||
          submission.playerId !== player.id ||
          !program
        ) {
          throw new Error('Program does not belong to this game')
        }
        game.submitProgram(player.id, program)
      } catch {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      acknowledge({ outcome: 'ACCEPTED' })
      socket.to(publicRoom(gameId)).emit('program.submitted', {
        gameId,
        playerId: player.id,
      })

      scheduleNextAction()
    })

    socket.emit('cards.dealt', presentCardsDealt(gameId, player))
  })

  return io
}
