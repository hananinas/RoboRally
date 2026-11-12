import type { PlayerState, PublicGameState, RegistersChanged, RobotActionResolved } from '@robo-rally/game-events'
import { createPublicState, GAME_ID } from './game-fixture-data.ts'

export const ADA_ID = '22222222-2222-4222-8222-222222222224'
export const MIKKEL_ID = '22222222-2222-4222-8222-222222222225'
export const NOOR_ID = '22222222-2222-4222-8222-222222222226'
export const REGISTER_ROBOT_IDS = [
  '33333333-3333-4333-8333-333333333335',
  '33333333-3333-4333-8333-333333333336',
  '33333333-3333-4333-8333-333333333337',
] as const

// `game.registersChanged` carries occupancy only: a slot is EMPTY or HIDDEN, never REVEALED.
export type RegistersOccupancy = RegistersChanged['registers']

export const ADA_OCCUPANCY: RegistersOccupancy = [
  { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' },
]

export const MIKKEL_OCCUPANCY: RegistersOccupancy = [
  { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' },
]

export const programmingPlayers: readonly PlayerState[] = [
  {
    playerId: ADA_ID, username: 'Ada', lastCheckpoint: 1, connected: true, programSubmitted: false,
    registers: [{ status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' }],
  },
  {
    playerId: MIKKEL_ID, username: 'Mikkel', lastCheckpoint: 0, connected: true, programSubmitted: true,
    registers: [{ status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }],
  },
  {
    playerId: NOOR_ID, username: 'Noor', lastCheckpoint: 0, connected: false, programSubmitted: false,
    registers: [{ status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }],
  },
]

export const executionPlayers: readonly PlayerState[] = programmingPlayers.map((player) => ({
  ...player,
  programSubmitted: true,
  registers: player.playerId === ADA_ID
    ? [{ status: 'REVEALED', instruction: 'MOVE_1' }, { status: 'REVEALED', instruction: 'TURN_RIGHT' }, { status: 'REVEALED', instruction: 'MOVE_2' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }]
    : [{ status: 'REVEALED', instruction: 'MOVE_1' }, { status: 'REVEALED', instruction: 'TURN_RIGHT' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }],
}))

export const executionAction: RobotActionResolved = {
  gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2', resolvedInstruction: 'MOVE_2',
  position: { coordinate: { x: 3, y: 1 }, orientation: 'NORTH' },
  pushedRobots: [],
}

export function createRegisterState(executing = false): PublicGameState & { players: readonly PlayerState[] } {
  const base = createPublicState()
  return {
    ...base,
    phase: executing ? 'EXECUTING' : 'PROGRAMMING',
    checkpointCount: 2,
    paused: !executing,
    players: [
      { ...base.players[0], registers: [{ status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }] },
      ...(executing ? executionPlayers.map((player) => ({ ...player, connected: true })) : programmingPlayers),
    ],
    robots: [
      base.robots[0],
      ...programmingPlayers.map((player, index) => ({
        robotId: REGISTER_ROBOT_IDS[index], playerId: player.playerId,
        robotSpriteId: 'tank' as const,
        colour: ['#4D8DEB', '#4CAF70', '#A66BE0'][index],
        position: { coordinate: { x: 3 + index, y: 3 }, orientation: 'NORTH' as const },
        startPosition: { x: 3 + index, y: 3 },
      })),
    ],
    board: {
      ...base.board,
      tiles: base.board.tiles.map((tile, index) => index < 2 ? { ...tile, checkpointNumber: index + 1 } : tile),
    },
  }
}
