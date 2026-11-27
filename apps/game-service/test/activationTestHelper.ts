import type { ActivationProgress, Game, NextActionResult } from '@/domain/game/index'

// Resolve register-end steps after the last robot's card.
export function resolveRobotAction(game: Game): NextActionResult {
  const result = game.executeNextAction()
  let progress: ActivationProgress = result
  while (game.hasPendingEnvironment) {
    const { roundConcluded, declaredWinner } = game.executeNextStep().result
    progress = { roundConcluded, declaredWinner }
  }
  return { ...result, ...progress }
}
