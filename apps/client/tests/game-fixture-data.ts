import type {
  Card,
  CardsDealt,
  PhaseChanged,
  ProgramResultOutcome,
  ProgramSubmitted,
  PublicGameState,
  RobotActionResolved,
  SubmitProgram,
} from '@robo-rally/game-events'

export const GAME_SERVICE_URL = 'http://127.0.0.1:4174'
export const GAME_ID = '11111111-1111-4111-8111-111111111111'
export const PLAYER_ID = '22222222-2222-4222-8222-222222222222'
export const ROBOT_ID = '33333333-3333-4333-8333-333333333333'
export const OTHER_PLAYER_ID = '22222222-2222-4222-8222-222222222223'
export const OTHER_ROBOT_ID = '33333333-3333-4333-8333-333333333334'

export function createPublicState(): PublicGameState {
  return {
    gameId: GAME_ID,
    phase: 'PROGRAMMING',
    antenna: { x: 5, y: 0, angle: Math.PI / 2 },
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
    }, {
      robotId: OTHER_ROBOT_ID,
      playerId: OTHER_PLAYER_ID,
      position: { coordinate: { x: 7, y: 5 }, orientation: 'NORTH' },
    }],
  }
}

export const ROUND_ACTIONS: readonly RobotActionResolved[] = [
  { gameId: GAME_ID, registerIndex: 0, robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, registerIndex: 1, robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 3 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, registerIndex: 2, robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 5, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, registerIndex: 3, robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 4, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, registerIndex: 4, robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 4, y: 3 }, orientation: 'SOUTH' } },
]

export type FixtureControl =
  | { type: 'submission'; outcome: ProgramResultOutcome; deferred: boolean }
  | { type: 'acknowledge'; outcome: ProgramResultOutcome }
  | { type: 'disconnect' }
  | { type: 'state-requests'; deferred: boolean }
  | { type: 'respond-state' }
  | { type: 'round'; actions: readonly RobotActionResolved[]; deferHand?: boolean }
  | { type: 'deal' }
  | { type: 'phase'; phase: PhaseChanged }
  | { type: 'hand'; hand: CardsDealt }
  | { type: 'submitted'; submission: ProgramSubmitted }

export type FixtureSnapshot = {
  id: string
  cards: readonly Card[]
  state: PublicGameState
  submissions: readonly SubmitProgram[]
  stateRequests: number
  pendingStateRequests: number
}
