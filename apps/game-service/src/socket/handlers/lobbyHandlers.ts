import {
  getLobbyDetailsSchema,
  type GetLobbyDetails,
  type LobbyDetailsAcknowledgement,
} from '@robo-rally/game-events'
import { err, ok, type Result } from 'neverthrow'
import type { ZodError } from 'zod'
import { withAcknowledgeOnce } from '@/socket/utilities/acknowledgeOnce'
import { logError, logWarn } from '@/logger'
import { toRejection, type Rejection } from '@/socket/utilities/rejection'
import { presentLobbyDetails } from '@/socket/gamePresenter'
import type { GameSocket } from '@/socket/gameServer'
import type { MembershipContext } from '@/socket/handlers/membershipHandlers'

type ValidateLobbyRequestError =
  | 'LOGIN_REQUIRED'
  | Rejection<'INVALID_REQUEST', ZodError>

function validateLobbyRequest(
  socket: GameSocket,
  payload: unknown,
): Result<GetLobbyDetails, ValidateLobbyRequestError> {
  if (!socket.data.user) return err('LOGIN_REQUIRED')
  const parsed = getLobbyDetailsSchema.safeParse(payload)
  if (!parsed.success) return err({ outcome: 'INVALID_REQUEST', detail: parsed.error })
  return ok(parsed.data)
}

export function handleGetLobbyDetails(
  ctx: MembershipContext,
  socket: GameSocket,
  payload: GetLobbyDetails,
  acknowledge: LobbyDetailsAcknowledgement,
): void {
  withAcknowledgeOnce(acknowledge, (ack) => {
    const result = validateLobbyRequest(socket, payload).mapErr(toRejection)
    if (result.isErr()) {
      const { outcome, detail } = result.error
      logWarn('Rejected game.getLobbyDetails request', { command: 'game.getLobbyDetails', gameId: ctx.gameId, outcome, detail, payload })
      ack({ outcome })
      return
    }

    const players = [...ctx.memberships.values()].map(({ user, player }) => ({
      playerId: player.id,
      username: user.username,
    }))
    ack({ outcome: 'LOBBY_FOUND', lobbies: [presentLobbyDetails(ctx.gameId, ctx.game, players)] })
  }, (error) => {
    logError('Failed to process game.getLobbyDetails', error, { command: 'game.getLobbyDetails', gameId: ctx.gameId, payload })
    return { outcome: 'INTERNAL_ERROR' } as const
  })
}
