import { randomUUID } from 'node:crypto'
import { err, ok, type Result } from 'neverthrow'
import {
  leaveGameSchema,
  parseGetPublicGameState,
  type GetPublicGameState,
  type LeaveGame,
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

function resumeUnlessStillDisconnected(ctx: MembershipContext): void {
  if (!anyDisconnected(ctx)) ctx.game.resume()
}

function notifyReconnected(ctx: MembershipContext, playerId: string): void {
  ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', {
    gameId: ctx.gameId, playerId, connected: true, paused: ctx.game.paused,
  })
  ctx.actionScheduler.scheduleNextAction()
}

function validateMembershipRequest(
  ctx: MembershipContext,
  schema: typeof leaveGameSchema,
  payload: unknown,
  user: User | undefined,
): Result<User, 'LOGIN_REQUIRED' | 'INVALID_REQUEST' | 'GAME_NOT_FOUND'> {
  if (!user) return err('LOGIN_REQUIRED')
  const parsed = schema.safeParse(payload)
  if (!parsed.success) return err('INVALID_REQUEST')
  if (parsed.data.gameId !== ctx.gameId) return err('GAME_NOT_FOUND')
  return ok(user)
}

export function ownedMembership(ctx: MembershipContext, socket: GameSocket): GameMembership | undefined {
  const membership = ctx.memberships.get(socket.data.user?.userId ?? '')
  return membership?.connectionId === socket.id ? membership : undefined
}

export function reconnectIfRecovered(ctx: MembershipContext, socket: GameSocket): void {
  if (!socket.recovered || !socket.data.user) return
  const membership = ctx.memberships.get(socket.data.user.userId)
  if (membership && reattachMembership(membership, socket.id)) {
    resumeUnlessStillDisconnected(ctx)
    notifyReconnected(ctx, membership.player.id)
  }
}

// Published games have a fixed roster. Only an existing member can reattach.
export function reattachGame(
  ctx: MembershipContext,
  socket: GameSocket,
  acknowledge: JoinResultAcknowledgement,
): void {
  const user = socket.data.user
  if (!user) return acknowledge({ outcome: 'LOGIN_REQUIRED' })
  const membership = ctx.memberships.get(user.userId)
  if (!membership) return acknowledge({ outcome: 'GAME_NOT_FOUND' })
  if (membership.connectionId && membership.connectionId !== socket.id) {
    return acknowledge({ outcome: 'USER_ALREADY_IN_GAME' })
  }
  const previousConnectionId = membership.connectionId
  const wasPaused = ctx.game.paused
  const reconnected = reattachMembership(membership, socket.id)
  resumeUnlessStillDisconnected(ctx)
  let initialization: Extract<JoinResult, { outcome: 'JOINED' }>
  try {
    initialization = presentInitialization(ctx, membership)
    void socket.join([ctx.publicRoom, ctx.playerRoom(membership.player.id)])
  } catch {
    membership.connectionId = previousConnectionId
    if (wasPaused) ctx.game.pause()
    return acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
  acknowledge(initialization)
  if (reconnected) notifyReconnected(ctx, membership.player.id)
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: LeaveGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  if (typeof acknowledge !== 'function') return
  const { io, game, gameId, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  const verdict = validateMembershipRequest(ctx, leaveGameSchema, payload, socket.data.user)
  if (verdict.isErr()) return acknowledge({ outcome: verdict.error })
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
  actionScheduler.broadcastCheckpointProgress()
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

export function createPlayer(): Player {
  return new Player(randomUUID(), new Robot(randomUUID(), Direction.NORTH),
    createHand(Array.from({ length: 9 }, () => randomUUID())))
}

export function presentInitialization(ctx: MembershipContext, membership: GameMembership): Extract<JoinResult, { outcome: 'JOINED' }> {
  const { player } = membership
  return {
    outcome: 'JOINED',
    assignment: { gameId: ctx.gameId, playerId: player.id, robotId: player.robot.id },
    state: ctx.publicState(),
    hand: presentCardsDealt(ctx.gameId, player).cards,
    programSubmitted: ctx.game.hasSubmittedProgram(player.id),
  }
}
