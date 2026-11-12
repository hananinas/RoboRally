import type {
  Card,
  CardsDealt,
  PlayerCheckpointProgress,
  PrivateProgram,
  PlayerConnectionChanged,
  ProgramResultOutcome,
  ProgramSubmitted,
  ProgramFinalized,
  ProgrammingTimer,
  PublicGameState,
  RegistersChanged,
  RobotActionResolved,
  SubmitProgram,
  UpdateRegisters,
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
    serverTime: 0,
    programmingTimer: { status: 'IDLE' },
    players: [{ playerId: PLAYER_ID, lastCheckpoint: 0, username: 'Player 1', programSubmitted: false, connected: true, registers: [{ status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }] }],
    phase: 'PROGRAMMING',
    paused: false,
    aborted: false,
    checkpointCount: 0,
    winner: null,
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
      colour: '#c74f4f',
      playerId: PLAYER_ID,
      position: { coordinate: { x: 5, y: 5 }, orientation: 'NORTH' },
    }, {
      robotId: OTHER_ROBOT_ID,
      colour: '#4D8DEB',
      playerId: OTHER_PLAYER_ID,
      position: { coordinate: { x: 7, y: 5 }, orientation: 'NORTH' },
    }],
  }
}

export const HAND_INSTRUCTIONS = [
  'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
  'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
] as const

export const ROUND_ACTIONS: readonly RobotActionResolved[] = [
  { gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 0, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1', position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 1, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1', position: { coordinate: { x: 5, y: 3 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 2, pushedRobots: [], robotId: ROBOT_ID, instruction: 'TURN_LEFT', resolvedInstruction: 'TURN_LEFT', position: { coordinate: { x: 5, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 3, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', resolvedInstruction: 'MOVE_1', position: { coordinate: { x: 4, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, playerId: PLAYER_ID, registerIndex: 4, pushedRobots: [], robotId: ROBOT_ID, instruction: 'TURN_LEFT', resolvedInstruction: 'TURN_LEFT', position: { coordinate: { x: 4, y: 3 }, orientation: 'SOUTH' } },
]

export type FixtureControl =
  | { type: 'checkpoint-progress'; progress: PlayerCheckpointProgress }
  | { type: 'connection-changed'; payload: PlayerConnectionChanged }
  | { type: 'registers-changed'; payload: RegistersChanged }
  | { type: 'submission'; outcome: ProgramResultOutcome; deferred: boolean }
  | { type: 'acknowledge'; outcome: ProgramResultOutcome }
  | { type: 'disconnect' }
  | { type: 'round'; actions: readonly RobotActionResolved[]; deferHand?: boolean }
  | { type: 'deal' }
  | { type: 'hand'; hand: CardsDealt }
  | { type: 'submitted'; submission: ProgramSubmitted }
  | { type: 'finalized'; program: ProgramFinalized }
  | { type: 'timer'; timer: ProgrammingTimer; serverTime?: number }
  | { type: 'clock'; serverTime?: number; deferred: boolean }
  | { type: 'respond-clock' }
  | { type: 'early-hand'; cards: readonly Card[] }
  | { type: 'start'; deferred: boolean; outcome?: 'STARTED' | 'LOBBY_MEMBER_DISCONNECTED' }
  | { type: 'respond-start' }
  | { type: 'joined-state'; state: PublicGameState; hand: readonly Card[]; programSubmitted: boolean; program?: PrivateProgram }

export type FixtureSnapshot = {
  id: string
  cards: readonly Card[]
  state: PublicGameState
  submissions: readonly SubmitProgram[]
  registerUpdates: readonly UpdateRegisters[]
  entryRequests: readonly (
    | { event: 'session.get' | 'lobby.create' | 'lobby.start'; socketId: string; payload: Record<string, never> }
    | { event: 'lobby.join'; socketId: string; payload: { lobbyId: string } }
  )[]
  pendingStarts: number
  pendingClocks: number
}
