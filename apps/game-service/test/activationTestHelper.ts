import type { Game, NextActionResult } from '@/domain/game/index'

// Resolve register-end steps after the last robot's card.
export function resolveRobotAction(game: Game): NextActionResult {
  const result = game.executeNextAction()
  return { ...result, roundConcluded: resolveEnvironment(game) || result.roundConcluded }
}

export function resolveEnvironment(game: Game): boolean {
  let roundConcluded = false
  while (game.hasPendingEnvironment) roundConcluded = game.executeNextStep().result.roundConcluded
  return roundConcluded
}
