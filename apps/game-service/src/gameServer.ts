import { randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import {
  parseGetPublicGameState,
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
  Player,
  Robot,
  Direction,
  type Card,
  type Game,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPhaseChanged,
  presentPublicGameState,
  presentRobotActionResolved,
} from './gamePresenter.js'
import { createSharedGame } from './game/SinglePlayerGame.js'
import { createUserRegistry } from './userRegistry.js'

export type GameSocketData = { user?: User; playerId?: string }

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
}>

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
  session: GameSession = createSharedGame(),
): GameSocketServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, GameSocketData>(httpServer)
  const users = createUserRegistry()
  const { gameId, game } = session
  const members = new Map<string, { user: User; socketId: string; player: Player }>()
  const snapshot = () => presentPublicGameState(gameId, game, (id) => members.get(id)?.user.username ?? id)
  const ownedPlayer = (socket: GameSocket) => {
    const member = socket.data.playerId ? members.get(socket.data.playerId) : undefined
    return member?.socketId === socket.id && member.user.userId === socket.data.user?.userId
      ? member.player : undefined
  }
  let publishedPhase = game.phase
  let publishedRound = game.roundNumber
  let scheduledAction: NodeJS.Immediate | undefined
  let closed = false

  // Submission and future membership handlers share this progression path.
  function advanceGame(): void {
    if (closed) return
    if (publishedPhase !== game.phase || publishedRound !== game.roundNumber) {
      publishedPhase = game.phase
      publishedRound = game.roundNumber
      io.to(publicRoom(gameId)).emit('game.phaseChanged', presentPhaseChanged(gameId, game))
      if (game.phase === 'programming') {
        for (const player of game.players) {
          io.to(playerRoom(gameId, player.id)).emit(
            'cards.dealt',
            presentCardsDealt(gameId, game.roundNumber, player),
          )
        }
      }
    }
    if (game.phase !== 'activation' || scheduledAction) return
    scheduledAction = setImmediate(() => {
      scheduledAction = undefined
      if (closed) return
      if (game.phase === 'activation') {
        const result = game.executeNextAction()
        io.to(publicRoom(gameId)).emit(
          'robot.actionResolved',
          presentRobotActionResolved(gameId, result),
        )
      }
      advanceGame()
    })
  }

  httpServer.once('close', () => {
    closed = true
    clearImmediate(scheduledAction)
  })

  io.on('connection', (socket) => {
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

    socket.on('game.join', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const user = socket.data.user
      if (!user) { acknowledge({ outcome: 'LOGIN_REQUIRED' }); return }
      let requestedGame: string
      try { requestedGame = parseGetPublicGameState(payload).gameId }
      catch { acknowledge({ outcome: 'INVALID_REQUEST' }); return }
      if (requestedGame !== gameId) { acknowledge({ outcome: 'GAME_NOT_FOUND' }); return }
      let player = ownedPlayer(socket)
      const repeated = !!player
      if (!player) {
        if ([...members.values()].some((member) => member.user.userId === user.userId)) {
          acknowledge({ outcome: 'USER_ALREADY_IN_GAME' }); return
        }
        const y = Math.floor(game.board.height / 2)
        let x = Math.floor(game.board.width / 2)
        while (x >= 0 && game.board.occupantAt({ x, y })) x--
        if (x < 0) { acknowledge({ outcome: 'NO_SPAWN_AVAILABLE' }); return }
        player = new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH))
        game.addPlayer(player, { x, y })
        members.set(player.id, { user, socketId: socket.id, player })
        socket.data.playerId = player.id
      }
      // No asynchronous work between the snapshot acknowledgement and room access.
      // Socket.IO's default in-memory adapter joins synchronously.
      const state = snapshot()
      acknowledge({
        outcome: 'JOINED',
        assignment: { gameId, playerId: player.id, robotId: player.robot.id },
        state, hand: presentCardsDealt(gameId, game.roundNumber, player).cards,
        programSubmitted: game.hasSubmittedProgram(player.id),
      })
      if (!repeated) {
        io.to(publicRoom(gameId)).emit('game.playerJoined', {
          gameId, roundNumber: game.roundNumber,
          player: state.players.find((entry) => entry.playerId === player.id)!,
          robot: state.robots.find((entry) => entry.robotId === player.robot.id)!,
        })
      }
      socket.join([publicRoom(gameId), playerRoom(gameId, player.id)])
    })

    function leave(): boolean {
      const player = ownedPlayer(socket)
      if (!player) return false
      const roundNumber = game.roundNumber
      socket.leave(publicRoom(gameId))
      socket.leave(playerRoom(gameId, player.id))
      members.delete(player.id)
      delete socket.data.playerId
      game.removePlayer(player.id)
      io.to(publicRoom(gameId)).emit('game.playerLeft', {
        gameId, roundNumber, playerId: player.id, robotId: player.robot.id,
      })
      advanceGame()
      return true
    }

    socket.on('game.leave', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      if (!socket.data.user) { acknowledge({ outcome: 'LOGIN_REQUIRED' }); return }
      let requestedGame: string
      try { requestedGame = parseGetPublicGameState(payload).gameId }
      catch { acknowledge({ outcome: 'INVALID_REQUEST' }); return }
      acknowledge({ outcome: requestedGame === gameId && leave() ? 'LEFT' : 'NOT_IN_GAME' })
    })
    socket.on('disconnect', () => { leave() })

    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const request = parseGetPublicGameState(payload)
        if (request.gameId === gameId && ownedPlayer(socket)) {
          acknowledge({
            outcome: 'GAME_FOUND',
            state: snapshot(),
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

      const player = ownedPlayer(socket)
      if (!player) { acknowledge({ outcome: 'INVALID_PROGRAM' }); return }
      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (
          submission.gameId !== gameId ||
          submission.playerId !== player.id ||
          submission.roundNumber !== game.roundNumber ||
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
      io.to(publicRoom(gameId)).emit('program.submitted', {
        gameId,
        roundNumber: game.roundNumber,
        playerId: player.id,
      })

      advanceGame()
    })

  })

  return io
}
