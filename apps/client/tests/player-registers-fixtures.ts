import type { PublicGameState } from '@robo-rally/game-events'
import type { PublicPlayerState, PublicRobotActionResolved } from '../src/scenes/active-game/publicRegisters.ts'
import { createPublicState, GAME_ID } from './game-fixture-data.ts'

export const ADA_ID = '22222222-2222-4222-8222-222222222224'
export const MIKKEL_ID = '22222222-2222-4222-8222-222222222225'
export const NOOR_ID = '22222222-2222-4222-8222-222222222226'
export const REGISTER_ROBOT_IDS = [
  '33333333-3333-4333-8333-333333333335',
  '33333333-3333-4333-8333-333333333336',
  '33333333-3333-4333-8333-333333333337',
] as const

export const programmingPlayers: readonly PublicPlayerState[] = [
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

export const executionPlayers: readonly PublicPlayerState[] = programmingPlayers.map((player) => ({
  ...player,
  programSubmitted: true,
  registers: player.playerId === ADA_ID
    ? [{ status: 'REVEALED', instruction: 'MOVE_1' }, { status: 'REVEALED', instruction: 'TURN_RIGHT' }, { status: 'REVEALED', instruction: 'MOVE_2' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }]
    : [{ status: 'REVEALED', instruction: 'MOVE_1' }, { status: 'REVEALED', instruction: 'TURN_RIGHT' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }, { status: 'HIDDEN' }],
}))

export const executionAction: PublicRobotActionResolved = {
  gameId: GAME_ID, playerId: ADA_ID, robotId: REGISTER_ROBOT_IDS[0], registerIndex: 2, instruction: 'MOVE_2',
  position: { coordinate: { x: 3, y: 1 }, orientation: 'NORTH' },
  pushedRobots: [],
}

export function createRegisterState(executing = false): PublicGameState & { players: readonly PublicPlayerState[] } {
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
        position: { coordinate: { x: 3 + index, y: 3 }, orientation: 'NORTH' as const },
      })),
    ],
    board: {
      ...base.board,
      tiles: base.board.tiles.map((tile, index) => index < 2 ? { ...tile, checkpointNumber: index + 1 } : tile),
    },
  }
}
