import { randomUUID } from 'node:crypto'
import {
  getPublicGameStateSchema,
  parseGetPublicGameState,
  type GetPublicGameState,
  type JoinGame,
  type JoinResult,
  type JoinResultAcknowledgement,
  type LeaveResult,
  type PublicGameState,
  type PublicGameStateAcknowledgement,
  type User,
} from '@robo-rally/game-events'
import {
  Player,
  Robot,
  Direction,
  type Game,
} from '@/game/index'
import { presentCardsDealt } from '@/gamePresenter'
import { createHand } from '@/game/SinglePlayerGame'
import type { ActionScheduler } from '@/actionScheduler'
import type { GameSocket, GameSocketServer } from '@/gameServer'

export type GameMembership = {
  user: User
  player: Player
  connectionId: string | null
}

export type MembershipContext = {
  io: GameSocketServer
  game: Game
  gameId: string
  publicRoom: string
  playerRoom: (playerId: string) => string
  memberships: Map<string, GameMembership>
  publicState: () => PublicGameState
  actionScheduler: ActionScheduler
}

function anyDisconnected(ctx: MembershipContext): boolean {
  return [...ctx.memberships.values()].some((membership) => membership.connectionId === null)
}

function reattachMembership(membership: GameMembership, socketId: string): boolean {
  const wasDisconnected = membership.connectionId === null
  membership.connectionId = socketId
  return wasDisconnected
}

function reconnectMembership(ctx: MembershipContext, playerId: string): void {
  if (!anyDisconnected(ctx)) ctx.game.resume()
  ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', {
    gameId: ctx.gameId, playerId, connected: true, paused: ctx.game.paused,
  })
  ctx.actionScheduler.scheduleNextAction()
}

function membershipRequest(ctx: MembershipContext, payload: unknown, user: User | undefined):
  { user: User } | { outcome: 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND' } {
  if (!user) return { outcome: 'LOGIN_REQUIRED' }
  const request = getPublicGameStateSchema.safeParse(payload)
  if (!request.success) return { outcome: 'INVALID_REQUEST' }
  if (request.data.gameId !== ctx.gameId) return { outcome: 'GAME_NOT_FOUND' }
  return { user }
}

export function ownedMembership(ctx: MembershipContext, socket: GameSocket): GameMembership | undefined {
  const membership = ctx.memberships.get(socket.data.user?.userId ?? '')
  return membership?.connectionId === socket.id ? membership : undefined
}

export function reconnectIfRecovered(ctx: MembershipContext, socket: GameSocket): void {
  if (!socket.recovered || !socket.data.user) return
  const membership = ctx.memberships.get(socket.data.user.userId)
  if (membership && reattachMembership(membership, socket.id)) {
    reconnectMembership(ctx, membership.player.id)
  }
}

export function handleJoin(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: JoinGame,
  acknowledge: JoinResultAcknowledgement,
): void {
  if (typeof acknowledge !== 'function') return
  const { game, gameId, memberships, publicRoom, playerRoom, publicState } = ctx
  const request = membershipRequest(ctx, payload, socket.data.user)
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
  const reconnected = !isNew && reattachMembership(membership, socket.id)
  if (reconnected && !anyDisconnected(ctx)) game.resume()
  const { player } = membership
  let result: Extract<JoinResult, { outcome: 'JOINED' }>
  try {
    result = {
      outcome: 'JOINED',
      assignment: { gameId, playerId: player.id, robotId: player.robot.id },
      state: publicState(),
      hand: presentCardsDealt(gameId, player).cards,
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
  void socket.join([publicRoom, playerRoom(player.id)])
  acknowledge(result)
  if (isNew) {
    socket.to(publicRoom).emit('game.playerJoined', {
      gameId,
      player: result.state.players.find((candidate) => candidate.playerId === player.id)!,
      robot: result.state.robots.find((robot) => robot.robotId === player.robot.id)!,
    })
  } else if (reconnected) {
    reconnectMembership(ctx, player.id)
  }
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: JoinGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const { io, game, gameId, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  const request = membershipRequest(ctx, payload, socket.data.user)
  if ('outcome' in request) return acknowledge(request)
  const membership = ownedMembership(ctx, socket)
  if (!membership) {
    acknowledge({ outcome: 'GAME_NOT_FOUND' })
    return
  }
  const { player, user } = membership
  const phaseBeforeLeave = game.phase
  game.removePlayer(player.id)
  memberships.delete(user.userId)
  void socket.leave(publicRoom)
  void socket.leave(playerRoom(player.id))
  acknowledge({ outcome: 'LEFT' })
  io.to(publicRoom).emit('game.playerLeft', {
    gameId, playerId: player.id, robotId: player.robot.id,
  })
  if (phaseBeforeLeave === 'activation' && game.phase === 'programming') actionScheduler.dealHands()
  actionScheduler.scheduleNextAction()
}

export function handleDisconnect(ctx: MembershipContext, socket: GameSocket): void {
  const membership = ownedMembership(ctx, socket)
  if (!membership) return
  membership.connectionId = null
  ctx.game.pause()
  ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', {
    gameId: ctx.gameId, playerId: membership.player.id, connected: false, paused: ctx.game.paused,
  })
}

export function handleGetPublicGameState(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: GetPublicGameState,
  acknowledge: PublicGameStateAcknowledgement,
): void {
  if (typeof acknowledge !== 'function') return

  try {
    const request = parseGetPublicGameState(payload)
    if (request.gameId === ctx.gameId && ownedMembership(ctx, socket)) {
      acknowledge({
        outcome: 'GAME_FOUND',
        state: ctx.publicState(),
      })
      return
    }
  } catch {
    // Invalid requests receive the same non-disclosing result as unknown games.
  }

  acknowledge({ outcome: 'GAME_NOT_FOUND' })
}
