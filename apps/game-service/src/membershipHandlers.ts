import { err, ok, type Result } from 'neverthrow'
import { withAcknowledgeOnce } from '@/acknowledgeOnce'
import {
  joinGameSchema,
  leaveGameSchema,
  type JoinGame,
  type JoinResult,
  type JoinResultAcknowledgement,
  type LeaveResult,
  type PublicGameState,
  type User,
} from '@robo-rally/game-events'
import {
  type AddPlayerError,
  type Game,
  type Player,
} from '@/game/index'
import { presentCardsDealt } from '@/gamePresenter'
import { logError } from '@/logger'
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
  schema: typeof joinGameSchema | typeof leaveGameSchema,
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

type MembershipSuccess = {
  membership: GameMembership
  isNew: boolean
  reconnected: boolean
  previousConnectionId: string | null
}
type MembershipFailure = 'USER_ALREADY_IN_GAME' | AddPlayerError
type MembershipResolution = Result<MembershipSuccess, MembershipFailure>

function addMembership(ctx: MembershipContext, socket: GameSocket, user: User): MembershipResolution {
  const { game, memberships } = ctx
  return game.addPlayer().map((player) => {
    const membership: GameMembership = { user, player, connectionId: socket.id }
    memberships.set(user.userId, membership)
    return { membership, isNew: true, reconnected: false, previousConnectionId: null }
  })
}

function reattachExistingMembership(
  ctx: MembershipContext,
  socket: GameSocket,
  membership: GameMembership,
): MembershipResolution {
  const previousConnectionId = membership.connectionId
  const reconnected = reattachMembership(membership, socket.id)
  if (reconnected) resumeUnlessStillDisconnected(ctx)
  return ok({ membership, isNew: false, reconnected, previousConnectionId })
}

function joinOrReconnectMembership(
  ctx: MembershipContext,
  socket: GameSocket,
  user: User,
): MembershipResolution {
  const membership = ctx.memberships.get(user.userId)
  if (membership?.connectionId && membership.connectionId !== socket.id) {
    return err('USER_ALREADY_IN_GAME')
  }
  return membership
    ? reattachExistingMembership(ctx, socket, membership)
    : addMembership(ctx, socket, user)
}

function rollbackMembership(
  ctx: MembershipContext,
  { membership, isNew, previousConnectionId }: {
    membership: GameMembership
    isNew: boolean
    previousConnectionId: string | null
  },
): void {
  if (isNew) {
    ctx.memberships.delete(membership.user.userId)
    ctx.game.removePlayer(membership.player.id)
  } else {
    membership.connectionId = previousConnectionId
  }
}

export function handleJoin(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: JoinGame,
  acknowledge: JoinResultAcknowledgement,
): void {
  const { game, gameId, publicRoom, playerRoom, publicState } = ctx
  let rollback: MembershipSuccess | undefined

  withAcknowledgeOnce(acknowledge, (ack) => {
    const resolution = validateMembershipRequest(ctx, joinGameSchema, payload, socket.data.user)
      .andThen((user) => joinOrReconnectMembership(ctx, socket, user))
    if (resolution.isErr()) {
      ack({ outcome: resolution.error })
      return
    }
    rollback = resolution.value
    const { membership, reconnected } = resolution.value
    const { player } = membership

    const result: Extract<JoinResult, { outcome: 'JOINED' }> = {
      outcome: 'JOINED',
      assignment: { gameId, playerId: player.id, robotId: player.robot.id },
      state: publicState(),
      hand: presentCardsDealt(gameId, player).cards,
      programSubmitted: game.hasSubmittedProgram(player.id),
    }
    void socket.join([publicRoom, playerRoom(player.id)])
    ack(result)
    if (rollback.isNew) {
      socket.to(publicRoom).emit('game.playerJoined', {
        gameId,
        player: result.state.players.find((candidate) => candidate.playerId === player.id)!,
        robot: result.state.robots.find((robot) => robot.robotId === player.robot.id)!,
      })
    } else if (reconnected) {
      notifyReconnected(ctx, player.id)
    }
  }, (error, alreadyAcknowledged) => {
    logError('Failed to process game join', error, { command: 'game.join', gameId, payload })
    if (rollback && !alreadyAcknowledged) rollbackMembership(ctx, rollback)
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: JoinGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  const { io, game, gameId, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  let playerId: string | undefined

  withAcknowledgeOnce(acknowledge, (ack) => {
    const resolved = validateMembershipRequest(ctx, leaveGameSchema, payload, socket.data.user)
      .andThen(() => {
        const membership = ownedMembership(ctx, socket)
        return membership ? ok(membership) : err('GAME_NOT_FOUND' as const)
      })
    if (resolved.isErr()) {
      ack({ outcome: resolved.error })
      return
    }
    const { player, user } = resolved.value
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
