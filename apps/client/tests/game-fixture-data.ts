import type {
  Card,
  CardsDealt,
  JoinGame,
  JoinResult,
  LobbyDetails,
  LobbyDetailsResult,
  Login,
  LoginResult,
  PlayerCheckpointProgress,
  PlayerConnectionChanged,
  ProgramResultOutcome,
  ProgramSubmitted,
  PublicGameState,
  RobotActionResolved,
  SubmitProgram,
} from '@robo-rally/game-events'
import type { ProgrammingStarted, RegistersChanged } from '../src/scenes/active-game/publicRegisters.ts'

export const GAME_SERVICE_URL = 'http://127.0.0.1:4174'
export const GAME_ID = '11111111-1111-4111-8111-111111111111'
export const PLAYER_ID = '22222222-2222-4222-8222-222222222222'
export const ROBOT_ID = '33333333-3333-4333-8333-333333333333'
export const OTHER_PLAYER_ID = '22222222-2222-4222-8222-222222222223'
export const OTHER_ROBOT_ID = '33333333-3333-4333-8333-333333333334'
export const MAP_ICON = 'data:image/svg+xml;base64,' + btoa(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#6b7280"/></svg>',
)

export function createLobby(): LobbyDetails {
  return {
    gameId: GAME_ID,
    name: 'Shared game',
    players: [{ playerId: OTHER_PLAYER_ID, username: 'Player 2' }],
    map: { name: 'DEMO MAP', icon: MAP_ICON, maxPlayers: 6 },
  }
}

export function createPublicState(): PublicGameState {
  return {
    gameId: GAME_ID,
    players: [{ playerId: PLAYER_ID, lastCheckpoint: 0, username: 'Player 1', programSubmitted: false, connected: true }],
    phase: 'PROGRAMMING',
    paused: false,
    aborted: false,
    checkpointCount: 0,
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

export const HAND_INSTRUCTIONS = [
  'MOVE_1', 'MOVE_2', 'MOVE_3', 'BACK_UP', 'TURN_LEFT',
  'TURN_RIGHT', 'U_TURN', 'MOVE_1', 'TURN_LEFT',
] as const

export const ROUND_ACTIONS: readonly RobotActionResolved[] = [
  { gameId: GAME_ID, registerIndex: 0, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 4 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, registerIndex: 1, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 5, y: 3 }, orientation: 'NORTH' } },
  { gameId: GAME_ID, registerIndex: 2, pushedRobots: [], robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 5, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, registerIndex: 3, pushedRobots: [], robotId: ROBOT_ID, instruction: 'MOVE_1', position: { coordinate: { x: 4, y: 3 }, orientation: 'WEST' } },
  { gameId: GAME_ID, registerIndex: 4, pushedRobots: [], robotId: ROBOT_ID, instruction: 'TURN_LEFT', position: { coordinate: { x: 4, y: 3 }, orientation: 'SOUTH' } },
]

export type FixtureControl =
  | { type: 'checkpoint-progress'; progress: PlayerCheckpointProgress }
  | { type: 'connection-changed'; payload: PlayerConnectionChanged }
  | { type: 'registers-changed'; payload: RegistersChanged }
  | { type: 'programming-started'; payload: ProgrammingStarted }
  | { type: 'submission'; outcome: ProgramResultOutcome; deferred: boolean }
  | { type: 'acknowledge'; outcome: ProgramResultOutcome }
  | { type: 'disconnect' }
  | { type: 'round'; actions: readonly RobotActionResolved[]; deferHand?: boolean }
  | { type: 'deal' }
  | { type: 'hand'; hand: CardsDealt }
  | { type: 'submitted'; submission: ProgramSubmitted }
  | { type: 'early-hand'; cards: readonly Card[] }
  | { type: 'login'; outcome: LoginResult['outcome']; deferred: boolean }
  | { type: 'join'; outcome: JoinResult['outcome']; deferred: boolean }
  | { type: 'lobby'; outcome: LobbyDetailsResult['outcome']; deferred: boolean; lobbies?: readonly LobbyDetails[] }
  | { type: 'respond-login' | 'respond-join' | 'respond-lobby' }
  | { type: 'joined-state'; state: PublicGameState; hand: readonly Card[]; programSubmitted: boolean }

export type FixtureSnapshot = {
  id: string
  cards: readonly Card[]
  state: PublicGameState
  submissions: readonly SubmitProgram[]
  entryRequests: readonly (
    | { event: 'user.login'; socketId: string; payload: Login }
    | { event: 'game.join'; socketId: string; payload: JoinGame }
  )[]
  pendingLogins: number
  pendingJoins: number
  lobbyRequests: number
  pendingLobbies: number
}
