import type { ZodError } from 'zod'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import { toRejection, type Rejection } from '@/socket/utilities/rejection'
import { logError, logWarn } from '@/logger'
import { err, ok, type Result } from 'neverthrow'
import {
  leaveGameSchema,
  type LeaveGame,
  type GameInitialization,
  type SessionResult,
  type LeaveResult,
  type PublicGameState,
  type User,
} from '@robo-rally/game-events'
import type { Player, Game } from '@/game/index'
import { presentCardsDealt } from '@/socket/gamePresenter'
import type { ActionScheduler } from '@/actionScheduler'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'

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

type ValidateMembershipRequestError =
  | 'LOGIN_REQUIRED'
  | 'GAME_NOT_FOUND'
  | Rejection<'INVALID_REQUEST', ZodError>

function validateMembershipRequest(
  ctx: MembershipContext,
  schema: typeof leaveGameSchema,
  payload: unknown,
  user: User | undefined,
): Result<User, ValidateMembershipRequestError> {
  if (!user) return err('LOGIN_REQUIRED')
  const parsed = schema.safeParse(payload)
  if (!parsed.success) return err({ outcome: 'INVALID_REQUEST', detail: parsed.error })
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
export function handleReattachGame(
  ctx: MembershipContext,
  socket: GameSocket,
  acknowledge: (result: SessionResult) => void,
): void {
  const user = socket.data.user
  if (!user) return acknowledge({ outcome: 'LOGIN_REQUIRED' })
  const membership = ctx.memberships.get(user.userId)
  if (!membership) return acknowledge({ outcome: 'INTERNAL_ERROR' })
  if (membership.connectionId && membership.connectionId !== socket.id) {
    return acknowledge({ outcome: 'USER_ALREADY_IN_SESSION' })
  }
  const previousRooms = new Set(socket.rooms)
  const previousConnectionId = membership.connectionId
  const wasPaused = ctx.game.paused
  const reconnected = reattachMembership(membership, socket.id)
  resumeUnlessStillDisconnected(ctx)
  let initialization: GameInitialization
  try {
    initialization = presentInitialization(ctx, membership)
    void socket.join([ctx.publicRoom, ctx.playerRoom(membership.player.id)])
  } catch (error) {
    for (const room of [ctx.publicRoom, ctx.playerRoom(membership.player.id)]) {
      if (!previousRooms.has(room)) void socket.leave(room)
    }
    logError('Failed to reattach game membership', error, { command: 'session.get', gameId: ctx.gameId })
    membership.connectionId = previousConnectionId
    if (wasPaused) ctx.game.pause()
    return acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
  acknowledge({ outcome: 'IN_GAME', initialization })
  if (reconnected) notifyReconnected(ctx, membership.player.id)
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: LeaveGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  const { io, game, gameId, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  let playerId: string | undefined

  withAcknowledgeOnce(acknowledge, (ack) => {
    const result = validateMembershipRequest(ctx, leaveGameSchema, payload, socket.data.user)
      .andThen(() => {
        const membership = ownedMembership(ctx, socket)
        return membership ? ok(membership) : err('GAME_NOT_FOUND' as const)
      })
      .mapErr(toRejection)
    if (result.isErr()) {
      const { outcome, detail } = result.error
      logWarn('Rejected game.leave request', { command: 'game.leave', gameId, outcome, detail, payload })
      ack({ outcome })
      return
    }
    const { player, user } = result.value
    playerId = player.id

    const phaseBeforeLeave = game.phase
    game.removePlayer(player.id)
    memberships.delete(user.userId)
    void socket.leave(publicRoom)
    void socket.leave(playerRoom(player.id))
    ack({ outcome: 'LEFT' })
    io.to(publicRoom).emit('game.playerLeft', {
      gameId, playerId: player.id, robotId: player.robot.id,
    })
    actionScheduler.broadcastCheckpointProgress()
    if (phaseBeforeLeave === 'activation' && game.phase === 'programming') actionScheduler.dealHands()
    actionScheduler.scheduleNextAction()
  }, (error) => {
    logError('Failed to process player leaving', error, { command: 'game.leave', gameId, playerId })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}

export function handleDisconnect(ctx: MembershipContext, socket: GameSocket): void {
  const membership = ownedMembership(ctx, socket)
  if (!membership) return

  try {
    membership.connectionId = null
    ctx.game.pause()
    ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', {
      gameId: ctx.gameId, playerId: membership.player.id, connected: false, paused: ctx.game.paused,
    })
  } catch (error) {
    logError('Failed to process player disconnect', error, { command: 'disconnect', gameId: ctx.gameId, playerId: membership.player.id })
  }
}

export function presentInitialization(
  ctx: MembershipContext,
  membership: GameMembership,
  state: PublicGameState = ctx.publicState(),
): GameInitialization {
  const { player } = membership
  return {
    outcome: 'JOINED',
    assignment: { gameId: ctx.gameId, playerId: player.id, robotId: player.robot.id },
    state,
    hand: presentCardsDealt(ctx.gameId, player).cards,
    programSubmitted: ctx.game.hasSubmittedProgram(player.id),
  }
}
