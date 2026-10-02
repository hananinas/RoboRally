import type { Server as HttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import {
  parseGetPublicGameState,
  getPublicGameStateSchema,
  LoginRequestError,
  parseLogin,
  parseSubmitProgram,
  type ClientToServerEvents,
  type ProgramCardIds,
  type JoinResult,
  type ServerToClientEvents,
  type User,
} from '@robo-rally/game-events'
import { Server } from 'socket.io'
import {
  Player,
  Robot,
  Direction,
  type Card,
  type Game,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from './gamePresenter.js'
import { createUserRegistry } from './userRegistry.js'
import { createHand, createSharedGame } from './game/SinglePlayerGame.js'

type GameMembership = {
  user: User
  player: Player
  connectionId: string | null
}

export type GameSocketData = { user?: User }

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  {},
  GameSocketData
>

function resolveProgram(
  player: Player,
  cardIds: ProgramCardIds,
): readonly Card[] | undefined {
  const hand = player.hand
  const program = cardIds.map((id) => hand.find((card) => card.id === id))
  return program.every((card) => card !== undefined) ? program : undefined
}

export function createGameSocketServer(
  httpServer: HttpServer,
  sharedGame: Readonly<{ gameId: string; game: Game }> = createSharedGame(),
): GameSocketServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    {},
    GameSocketData
  >(httpServer)
  const users = createUserRegistry()
  const { gameId, game } = sharedGame
  const publicRoom = `game:${gameId}:public`
  const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()

  const publicState = () => presentPublicGameState(gameId, game,
    [...memberships.values()].map(({ user, player, connectionId }) => ({
      playerId: player.id,
      username: user.username,
      programSubmitted: game.hasSubmittedProgram(player.id),
      connected: connectionId !== null,
    })),
  )

  function membershipRequest(payload: unknown, user: User | undefined):
    { user: User } | { outcome: 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND' } {
    if (!user) return { outcome: 'LOGIN_REQUIRED' }
    const request = getPublicGameStateSchema.safeParse(payload)
    if (!request.success) return { outcome: 'INVALID_REQUEST' }
    if (request.data.gameId !== gameId) return { outcome: 'GAME_NOT_FOUND' }
    return { user }
  }

  function executeActivation(): void {
    if (game.phase !== 'activation') return
    for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
      const result = game.executeCurrentRegister()
      for (const action of result.actions) {
        io.to(publicRoom).emit('robot.actionResolved', presentRobotActionResolved(action))
      }
    }
    for (const member of game.players) {
      io.to(playerRoom(member.id)).emit('cards.dealt', presentCardsDealt(member))
    }
  }

  io.on('connection', (socket) => {
    const ownedMembership = () => {
      const membership = memberships.get(socket.data.user?.userId ?? '')
      return membership?.connectionId === socket.id ? membership : undefined
    }

    socket.on('game.join', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const request = membershipRequest(payload, socket.data.user)
      if ('outcome' in request) return acknowledge(request)
      const { user } = request
      let membership = memberships.get(user.userId)
      if (membership?.connectionId && membership.connectionId !== socket.id) {
        acknowledge({ outcome: 'USER_ALREADY_IN_GAME' })
        return
      }
      const isNew = membership === undefined
      if (isNew && game.hasStarted) {
        acknowledge({ outcome: 'GAME_ALREADY_STARTED' })
        return
      }
      if (!membership) {
        const player = new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH),
          createHand(Array.from({ length: 9 }, () => randomUUID())))
        try {
          if (!game.addPlayer(player)) {
            acknowledge({ outcome: 'NO_SPAWN_AVAILABLE' })
            return
          }
        } catch {
          acknowledge({ outcome: 'INTERNAL_ERROR' })
          return
        }
        membership = { user, player, connectionId: socket.id }
        memberships.set(user.userId, membership)
      }
      const previousConnectionId = membership.connectionId
      membership.connectionId = socket.id
      const { player } = membership
      let result: Extract<JoinResult, { outcome: 'JOINED' }>
      try {
        result = {
          outcome: 'JOINED',
          assignment: { gameId, playerId: player.id, robotId: player.robot.id },
          state: publicState(),
          hand: presentCardsDealt(player).cards,
          programSubmitted: game.hasSubmittedProgram(player.id),
        }
      } catch {
        if (isNew) {
          memberships.delete(user.userId)
          game.removePlayer(player.id)
        } else {
          membership.connectionId = previousConnectionId
        }
        acknowledge({ outcome: 'INTERNAL_ERROR' })
        return
      }
      socket.join([publicRoom, playerRoom(player.id)])
      acknowledge(result)
      if (isNew) socket.to(publicRoom).emit('game.playerJoined', {
        gameId,
        player: result.state.players.find((candidate) => candidate.playerId === player.id)!,
        robot: result.state.robots.find((robot) => robot.robotId === player.robot.id)!,
      })
    })

    socket.on('game.leave', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const request = membershipRequest(payload, socket.data.user)
      if ('outcome' in request) return acknowledge(request)
      const membership = ownedMembership()
      if (!membership) {
        acknowledge({ outcome: 'GAME_NOT_FOUND' })
        return
      }
      const { player, user } = membership
      game.removePlayer(player.id)
      memberships.delete(user.userId)
      socket.leave(publicRoom)
      socket.leave(playerRoom(player.id))
      acknowledge({ outcome: 'LEFT' })
      io.to(publicRoom).emit('game.playerLeft', {
        gameId, playerId: player.id, robotId: player.robot.id,
      })
      executeActivation()
    })

    socket.on('disconnect', () => {
      const membership = ownedMembership()
      if (membership) membership.connectionId = null
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

    socket.on('game.getPublicGameState', (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return

      try {
        const request = parseGetPublicGameState(payload)
        if (request.gameId === gameId && ownedMembership()) {
          acknowledge({
            outcome: 'GAME_FOUND',
            state: publicState(),
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
      const player = ownedMembership()?.player
      if (!player) {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      try {
        const submission = parseSubmitProgram(payload)
        const program = resolveProgram(player, submission.cardIds)
        if (submission.gameId !== gameId || !program) {
          throw new Error('Program does not belong to this game')
        }
        game.submitProgram(player.id, program)
      } catch {
        acknowledge({ outcome: 'INVALID_PROGRAM' })
        return
      }

      acknowledge({ outcome: 'ACCEPTED' })
      socket.to(publicRoom).emit('program.submitted', {
        playerId: player.id,
      })

      executeActivation()
    })
  })

  return io
}
