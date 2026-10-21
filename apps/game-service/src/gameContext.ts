import type { GameSocketServer, GameSession } from '@/gameServer'
import { presentPublicGameState } from '@/gamePresenter'
import { createActionScheduler } from '@/actionScheduler'
import type { GameMembership, MembershipContext } from '@/membershipHandlers'

export function createGameContext(io: GameSocketServer, session: GameSession): MembershipContext {
  const { gameId, game } = session
  const publicRoom = `game:${gameId}:public`
  const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()
  const actionScheduler = createActionScheduler({ io, game, gameId, publicRoom, playerRoom })

  const publicState = () => presentPublicGameState(gameId, game,
    [...memberships.values()].map(({ user, player, connectionId }) => ({
      playerId: player.id,
      lastCheckpoint: player.lastCheckpoint,
      username: user.username,
      programSubmitted: game.hasSubmittedProgram(player.id),
      connected: connectionId !== null,
    })),
  )

  return {
    io, game, gameId, publicRoom, playerRoom, memberships, publicState, actionScheduler,
  }

}
