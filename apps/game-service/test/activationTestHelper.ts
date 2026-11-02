import type { Game, NextActionResult } from '@/game/index'

// Resolve register-end steps after the last robot's card.
export function resolveRobotAction(game: Game): NextActionResult {
  const result = game.executeNextAction()
  while (game.executionState.activation?.stage === 'ENVIRONMENT') game.executeNextStep()
  return result
}
