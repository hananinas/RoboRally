import type { GameSocketServer, GameSession } from '@/socket/gameServer'
import { presentPublicGameState } from '@/socket/gamePresenter'
import { createActionScheduler } from '@/actionScheduler'
import type { GameMembership, MembershipContext } from '@/socket/handlers/membershipHandlers'

export function createGameContext(io: GameSocketServer, session: GameSession): MembershipContext {
  const { gameId, game } = session
  const publicRoom = `game:${gameId}:public`
  const playerRoom = (playerId: string) => `game:${gameId}:player:${playerId}`
  const memberships = new Map<string, GameMembership>()
    const usernameOf = (playerId: string) =>
    [...memberships.values()].find((membership) => membership.player.id === playerId)?.user.username
  const actionScheduler = createActionScheduler({ io, game, gameId, publicRoom, playerRoom, usernameOf })

  const publicState = () => presentPublicGameState(gameId, game,
    [...memberships.values()].map(({ user, player, connectionId }) => ({
      playerId: player.id,
      lastCheckpoint: player.lastCheckpoint,
      username: user.username,
      programSubmitted: game.hasSubmittedProgram(player.id),
      connected: connectionId !== null,
    })),
    actionScheduler.winner(),
  )

  return {
    io, game, gameId, publicRoom, playerRoom, memberships, publicState, actionScheduler,
  }

}
