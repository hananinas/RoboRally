import type {
  Card,
  ProgramResultOutcome,
  PublicGameState,
  RobotActionResolved,
  SubmitProgram,
} from '@robo-rally/game-events'

export const GAME_SERVICE_URL = 'http://127.0.0.1:4174'
export const GAME_ID = '11111111-1111-4111-8111-111111111111'
export const PLAYER_ID = '22222222-2222-4222-8222-222222222222'
export const ROBOT_ID = '33333333-3333-4333-8333-333333333333'

export function createPublicState(): PublicGameState {
  return {
    gameId: GAME_ID,
    phase: 'PROGRAMMING',
    board: {
      width: 11,
      height: 11,
      tiles: Array.from({ length: 121 }, (_, index) => ({
        position: { x: index % 11, y: Math.floor(index / 11) },
        type: 'EMPTY',
      })),
    },
    robots: [{
      robotId: ROBOT_ID,
      playerId: PLAYER_ID,
      position: { coordinate: { x: 5, y: 5 }, orientation: 'NORTH' },
    }],
  }
}

export const HAND_INSTRUCTIONS = [
  'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
  'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
] as const

export const ROUND_ACTIONS: readonly RobotActionResolved[] = [
  { robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' } },
  { robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 3 }, orientation: 'NORTH' } },
  { robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 5, y: 3 }, orientation: 'WEST' } },
  { robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 4, y: 3 }, orientation: 'WEST' } },
  { robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 4, y: 3 }, orientation: 'SOUTH' } },
]

export type FixtureControl =
  | { type: 'submission'; outcome: ProgramResultOutcome; deferred: boolean }
  | { type: 'acknowledge'; outcome: ProgramResultOutcome }
  | { type: 'disconnect' }
  | { type: 'state-requests'; deferred: boolean }
  | { type: 'respond-state' }
  | { type: 'round'; actions: readonly RobotActionResolved[] }

export type FixtureSnapshot = {
  id: string
  cards: readonly Card[]
  state: PublicGameState
  submissions: readonly SubmitProgram[]
  stateRequests: number
  pendingStateRequests: number
}
