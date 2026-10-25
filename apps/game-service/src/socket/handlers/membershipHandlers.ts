import { leaveGameSchema, type JoinAccepted, type LeaveGame, type LeaveResult, type PublicGameState, type SessionResult, type User } from '@robo-rally/game-events'
import type { Game, Player } from '@/game/index'
import { logError } from '@/logger'
import { presentCardsDealt } from '@/socket/gamePresenter'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
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
  broadcastPublicState: () => void
  actionScheduler: ActionScheduler
}

function resumeUnlessStillDisconnected(ctx: MembershipContext): void {
  if (![...ctx.memberships.values()].some((membership) => membership.connectionId === null)) ctx.game.resume()
}

function notifyReconnected(ctx: MembershipContext, playerId: string): void {
  ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', {
    gameId: ctx.gameId, playerId, connected: true, paused: ctx.game.paused,
  })
  ctx.actionScheduler.scheduleNextAction()
}

export function ownedMembership(ctx: MembershipContext, socket: GameSocket): GameMembership | undefined {
  const membership = ctx.memberships.get(socket.data.user?.userId ?? '')
  return membership?.connectionId === socket.id ? membership : undefined
}

export function presentInitialization(ctx: MembershipContext, membership: GameMembership): JoinAccepted {
  const { player } = membership
  return {
    outcome: 'JOINED',
    assignment: { gameId: ctx.gameId, playerId: player.id, robotId: player.robot.id },
    state: ctx.publicState(),
    hand: presentCardsDealt(ctx.gameId, player).cards,
    programSubmitted: ctx.game.hasSubmittedProgram(player.id),
  }
}

export function reconnectIfRecovered(ctx: MembershipContext, socket: GameSocket): void {
  if (!socket.recovered || !socket.data.user) return
  const membership = ctx.memberships.get(socket.data.user.userId)
  if (!membership || membership.connectionId !== null) return
  membership.connectionId = socket.id
  resumeUnlessStillDisconnected(ctx)
  notifyReconnected(ctx, membership.player.id)
}

export function handleGameSession(
  ctx: MembershipContext,
  socket: GameSocket,
  acknowledge: (result: SessionResult) => void,
): void {
  let restored: GameMembership | undefined
  const wasPaused = ctx.game.paused
  withAcknowledgeOnce(acknowledge, (ack) => {
    const membership = ctx.memberships.get(socket.data.user?.userId ?? '')
    if (!membership) {
      ack({ outcome: 'NO_SESSION' })
      return
    }
    if (membership.connectionId !== null && membership.connectionId !== socket.id) {
      ack({ outcome: 'USER_ALREADY_IN_SESSION' })
      return
    }
    if (membership.connectionId === null) {
      restored = membership
      membership.connectionId = socket.id
      resumeUnlessStillDisconnected(ctx)
    }
    const initialization = presentInitialization(ctx, membership)
    void socket.join([ctx.publicRoom, ctx.playerRoom(membership.player.id)])
    ack({ outcome: 'IN_GAME', initialization })
    if (restored) notifyReconnected(ctx, membership.player.id)
  }, (error, alreadyAcknowledged) => {
    if (restored && !alreadyAcknowledged) {
      restored.connectionId = null
      if (wasPaused) ctx.game.pause()
      void socket.leave(ctx.publicRoom)
      void socket.leave(ctx.playerRoom(restored.player.id))
    }
    logError('Failed to restore game session', error, { command: 'session.get', gameId: ctx.gameId })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: LeaveGame,
  acknowledge: (result: LeaveResult) => void,
): void {
  const { io, game, gameId, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  withAcknowledgeOnce(acknowledge, (ack) => {
    if (!socket.data.user) return ack({ outcome: 'LOGIN_REQUIRED' })
    const parsed = leaveGameSchema.safeParse(payload)
    if (!parsed.success) return ack({ outcome: 'INVALID_REQUEST' })
    const membership = ownedMembership(ctx, socket)
    if (parsed.data.gameId !== gameId || !membership) return ack({ outcome: 'GAME_NOT_FOUND' })
    const { player, user } = membership
    game.removePlayer(player.id)
    memberships.delete(user.userId)
    resumeUnlessStillDisconnected(ctx)
    void socket.leave(publicRoom)
    void socket.leave(playerRoom(player.id))
    ack({ outcome: 'LEFT' })
    io.to(publicRoom).emit('game.playerLeft', { gameId, playerId: player.id, robotId: player.robot.id })
    actionScheduler.broadcastCheckpointProgress()
    if (game.awaitingProgrammingStart) actionScheduler.dealHands()
    actionScheduler.scheduleNextAction()
  }, (error) => {
    logError('Failed to process player leaving', error, { command: 'game.leave', gameId })
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
