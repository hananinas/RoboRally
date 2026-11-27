import {
  emptyRequestSchema,
  submitProgramSchema,
  updateRegistersSchema,
  voteSchema,
  type EmptyRequest,
  type LeaveResult,
  type ProgramResult,
  type SubmitProgram,
  type UpdateRegisters,
  type UpdateRegistersResult,
  type User,
  type Vote,
  type VoteResult,
} from '@robo-rally/game-events'
import { err, ok } from 'neverthrow'
import { withValidatedRequest } from '@/socket/utilities/withValidatedRequest'
import type { GameSocket, SocketContext } from '@/socket/gameServer'
import { publishProgramFinalized } from '@/socket/gameSession/programFinalization'
import { presentRegistersChanged } from '@/socket/presenters/gamePresenter'

function resolveActiveMember(context: SocketContext, socket: GameSocket, user: User) {
  const gameSession = context.registry.getCurrentGame(user.userId)
  if (!gameSession) return err({ outcome: 'NOT_A_MEMBER' as const })
  return gameSession.isMember(socket)
    .map((seat) => ({ gameSession, player: seat.player }))
    .mapErr(() => ({ outcome: 'NOT_A_MEMBER' as const }))
}

export function handleSubmitProgram(
  context: SocketContext,
  socket: GameSocket,
  payload: SubmitProgram,
  acknowledge: (result: ProgramResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'program.submit', schema: submitProgramSchema, payload, acknowledge,
    resolve: (user) => resolveActiveMember(context, socket, user),
    run: ({ gameSession, player }, ack) => {
      const result = gameSession.expireProgrammingIfDue().andThen(() => gameSession.game.submitProgram(player.id, payload.cardIds))
      if (result.isErr()) return ack({ outcome: result.error })
      ack({ outcome: 'ACCEPTED' })
      publishProgramFinalized(gameSession, result.value, 'SUBMITTED')
      gameSession.noteProgramSubmitted()
    },
  })
}

export function handleVote(
  context: SocketContext,
  socket: GameSocket,
  payload: Vote,
  acknowledge: (result: VoteResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'game.vote', schema: voteSchema, payload, acknowledge,
    resolve: (user) => resolveActiveMember(context, socket, user),
    run: ({ gameSession, player }, ack) => {
      const result = gameSession.castVote(player, payload.proposalId)
      if (result.isErr()) return ack({ outcome: result.error })
      if (result.value) context.registry.clearActiveMembership(result.value.userId)
      ack({ outcome: 'ACCEPTED' })
    },
  })
}

export function handleLeaveGame(
  context: SocketContext,
  socket: GameSocket,
  payload: EmptyRequest,
  acknowledge: (result: LeaveResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'game.leave', schema: emptyRequestSchema, payload, acknowledge,
    resolve: (user) => {
      const gameSession = context.registry.getCurrentGame(user.userId)
      return gameSession ? ok({ user, gameSession }) : err({ outcome: 'GAME_NOT_FOUND' as const })
    },
    run: ({ user, gameSession }, ack) => {
      const result = gameSession.leave(socket)
      if (result.isErr()) return ack({ outcome: 'GAME_NOT_FOUND' })
      context.registry.clearActiveMembership(user.userId)
      ack({ outcome: 'LEFT' })
      if (gameSession.seatCount === 0) {
        gameSession.actionScheduler.stop()
        context.registry.removeGame(gameSession.game.id)
      }
    },
  })
}

export function handleUpdateRegisters(
  context: SocketContext,
  socket: GameSocket,
  payload: UpdateRegisters,
  acknowledge: (result: UpdateRegistersResult) => void,
): void {
  withValidatedRequest({
    socket, command: 'game.updateRegisters', schema: updateRegistersSchema, payload, acknowledge,
    resolve: (user) => resolveActiveMember(context, socket, user),
    run: ({ gameSession, player }, ack) => {
      const result = gameSession.expireProgrammingIfDue().andThen(() => gameSession.game.updateRegisters(player.id, payload.cardIds))
      if (result.isErr()) return ack({ outcome: result.error })
      ack({ outcome: 'ACCEPTED' })
      gameSession.io.to(gameSession.publicRoom).emit('game.registersChanged', presentRegistersChanged(gameSession.game, player))
    },
  })
}
