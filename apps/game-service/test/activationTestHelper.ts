import type { Game, NextActionResult } from '@/domain/game/index'

// Resolve register-end steps after the last robot's card.
export function resolveRobotAction(game: Game): NextActionResult {
  const result = game.executeNextAction()
  let roundConcluded = result.roundConcluded
  while (game.hasPendingEnvironment) roundConcluded = game.executeNextStep().result.roundConcluded
  return { ...result, roundConcluded }
}
