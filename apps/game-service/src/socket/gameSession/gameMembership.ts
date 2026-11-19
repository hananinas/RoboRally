import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import { logError } from '@/logger'
import { err, ok } from 'neverthrow'
import {
  emptyRequestSchema,
  type EmptyRequest,
  type GameInitialization,
  type MembershipResult,
  type LeaveResult,
  type PublicGameState,
  type User,
} from '@robo-rally/game-events'
import type { Player, Game } from '@/domain/game/index'
import { presentInitialization, presentPlayerConnectionChanged, presentProgrammingTimer } from '@/socket/presenters/gamePresenter'
import type { ActionScheduler } from '@/socket/gameSession/actionScheduler'
import type { ProgrammingTimer } from '@/programmingTimer'
import type { GameSocket, GameSocketServer } from '@/socket/gameServer'

export type GameMembership = {
  user: User
  player: Player
  connectionId: string | null
}

export type MembershipContext = {
  io: GameSocketServer
  game: Game
  publicRoom: string
  playerRoom: (playerId: string) => string
  memberships: Map<string, GameMembership>
  publicState: () => PublicGameState
  actionScheduler: ActionScheduler
  programmingTimer: ProgrammingTimer
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
  if (anyDisconnected(ctx)) return
  const result = ctx.game.resume()
  if (result.isOk()) ctx.actionScheduler.announceProgress(result.value)
}

function notifyReconnected(ctx: MembershipContext, player: Player): void {
  ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', presentPlayerConnectionChanged(ctx.game, player, true))
  ctx.io.to(ctx.playerRoom(player.id)).emit('program.timerChanged', presentProgrammingTimer(ctx.game.id, ctx.programmingTimer.state()))
  ctx.actionScheduler.scheduleNextAction()
}

export function ownedMembership(ctx: MembershipContext, socket: GameSocket): GameMembership | undefined {
  const membership = ctx.memberships.get(socket.data.user.userId)
  return membership?.connectionId === socket.id ? membership : undefined
}

export function reconnectIfRecovered(ctx: MembershipContext, socket: GameSocket): void {
  if (!socket.recovered) return
  const membership = ctx.memberships.get(socket.data.user.userId)
  if (membership && reattachMembership(membership, socket.id)) {
    resumeUnlessStillDisconnected(ctx)
    notifyReconnected(ctx, membership.player)
  }
}

// Published games have a fixed roster. Only an existing member can reattach.
export function handleReattachGame(
  ctx: MembershipContext,
  socket: GameSocket,
  acknowledge: (result: MembershipResult) => void,
): void {
  const user = socket.data.user
  const membership = ctx.memberships.get(user.userId)
  if (!membership) return acknowledge({ outcome: 'INTERNAL_ERROR' })
  if (membership.connectionId && membership.connectionId !== socket.id) {
    return acknowledge({ outcome: 'ALREADY_HAS_MEMBERSHIP' })
  }
  const previousRooms = new Set(socket.rooms)
  const previousConnectionId = membership.connectionId
  const wasPaused = ctx.game.paused
  const reconnected = reattachMembership(membership, socket.id)
  resumeUnlessStillDisconnected(ctx)
  let initialization: GameInitialization
  try {
    initialization = presentInitialization(ctx.game, membership.player, ctx.publicState())
    void socket.join([ctx.publicRoom, ctx.playerRoom(membership.player.id)])
  } catch (error) {
    for (const room of [ctx.publicRoom, ctx.playerRoom(membership.player.id)]) {
      if (!previousRooms.has(room)) void socket.leave(room)
    }
    logError('Failed to reattach game membership', error, { command: 'membership.get', gameId: ctx.game.id })
    membership.connectionId = previousConnectionId
    if (wasPaused) ctx.game.pause()
    return acknowledge({ outcome: 'INTERNAL_ERROR' })
  }
  acknowledge({ outcome: 'IN_GAME', initialization, user })
  if (reconnected) notifyReconnected(ctx, membership.player)
}

export function handleLeave(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LeaveResult) => void,
): void {
  const { io, game, memberships, publicRoom, playerRoom, actionScheduler } = ctx
  withValidatedRequest({
    socket, command: 'game.leave', schema: emptyRequestSchema, payload, acknowledge,
    resolve: () => {
      const membership = ownedMembership(ctx, socket)
      return membership ? ok(membership) : err({ outcome: 'GAME_NOT_FOUND' as const })
    },
    run: (membership, ack) => {
      const { player, user } = membership
      const { roundConcluded } = game.removePlayer(player.id)
      memberships.delete(user.userId)
      void socket.leave(publicRoom)
      void socket.leave(playerRoom(player.id))
      ack({ outcome: 'LEFT' })
      io.to(publicRoom).emit('game.playerLeft', {
        gameId: game.id, playerId: player.id, robotId: player.robot.id,
      })
      if (game.requirePhase('activation').isOk()) ctx.programmingTimer.close()
      actionScheduler.announceProgress({ roundConcluded })
      actionScheduler.scheduleNextAction()
    },
  })
}

export function handleDisconnect(ctx: MembershipContext, socket: GameSocket): void {
  const membership = ownedMembership(ctx, socket)
  if (!membership) return

  try {
    membership.connectionId = null
    ctx.game.pause()
    ctx.io.to(ctx.publicRoom).emit('game.playerConnectionChanged', presentPlayerConnectionChanged(ctx.game, membership.player, false))
  } catch (error) {
    logError('Failed to process player disconnect', error, { command: 'disconnect', gameId: ctx.game.id, playerId: membership.player.id })
  }
}
