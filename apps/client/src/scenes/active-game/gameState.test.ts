import type {
  Card,
  JoinResult,
  ProgramCardIds,
  PublicGameState,
  RobotActionResolved,
} from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import {
  canProgram,
  createClientGameState,
  createSubmission,
  gameStateReducer,
  placeCard,
  REGISTER_COUNT,
  removeCard,
  type ClientGameState,
  type ProgramCard,
  type Registers,
} from './gameState.ts'

const cards: readonly Card[] = [
  { id: '10000000-0000-4000-8000-000000000001', instruction: 'MOVE_1' },
  { id: '10000000-0000-4000-8000-000000000002', instruction: 'TURN_LEFT' },
  { id: '10000000-0000-4000-8000-000000000003', instruction: 'MOVE_1' },
  { id: '10000000-0000-4000-8000-000000000004', instruction: 'TURN_LEFT' },
  { id: '10000000-0000-4000-8000-000000000005', instruction: 'MOVE_1' },
  { id: '10000000-0000-4000-8000-000000000006', instruction: 'MOVE_1' },
]
const selectedCardIds: ProgramCardIds = [
  cards[4].id,
  cards[0].id,
  cards[3].id,
  cards[1].id,
  cards[2].id,
]
const firstCard: ProgramCard = cards[0]
const secondCard: ProgramCard = cards[1]
const emptyRegisters: Registers = Object.freeze(
  Array.from({ length: REGISTER_COUNT }, () => null),
)
const robotId = '30000000-0000-4000-8000-000000000001'
const stationaryRobotId = '30000000-0000-4000-8000-000000000002'
const publicState: PublicGameState = {
  gameId: '40000000-0000-4000-8000-000000000001',
  phase: 'PROGRAMMING',
  board: {
    width: 5,
    height: 5,
    tiles: Array.from({ length: 25 }, (_, index) => ({
      position: { x: index % 5, y: Math.floor(index / 5) },
      type: 'EMPTY',
    })),
  },
  robots: [
    {
      robotId,
      playerId: '50000000-0000-4000-8000-000000000001',
      position: { coordinate: { x: 2, y: 3 }, orientation: 'NORTH' },
    },
    {
      robotId: stationaryRobotId,
      playerId: '50000000-0000-4000-8000-000000000002',
      position: { coordinate: { x: 4, y: 4 }, orientation: 'EAST' },
    },
  ],
}
const actions: readonly RobotActionResolved[] = [
  { robotId, instruction: 'MOVE_1', position: { coordinate: { x: 2, y: 2 }, orientation: 'NORTH' } },
  { robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 2, y: 2 }, orientation: 'WEST' } },
  { robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 2 }, orientation: 'WEST' } },
  { robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 1, y: 2 }, orientation: 'SOUTH' } },
  { robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 3 }, orientation: 'SOUTH' } },
]

const result: Extract<JoinResult, { outcome: 'JOINED' }> = {
  outcome: 'JOINED',
  assignment: { gameId: publicState.gameId, playerId: publicState.robots[0].playerId, robotId },
  state: publicState,
  hand: cards,
  programSubmitted: false,
}

function programmingState(): ClientGameState {
  return gameStateReducer(createClientGameState(), { type: 'joined', result })
}

describe('join initialization', () => {
  it('initializes assignment, board and hand together and accepts subsequent events', () => {
    const state = gameStateReducer(createClientGameState(), { type: 'joined', result })
    expect(state.assignment).toEqual(result.assignment)
    expect(state.board).not.toBeNull()
    expect(state.hand).toEqual(cards)
    expect(state.playback.robots).toHaveLength(publicState.robots.length)
    expect(canProgram(state)).toBe(true)
    const updated = gameStateReducer(state, { type: 'action', action: actions[0] })
    expect(updated.playback.active).toEqual(actions[0])
  })

  it('preserves an executing phase with an empty initial hand', () => {
    const state = gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, state: { ...publicState, phase: 'EXECUTING' }, hand: [] },
    })
    expect(state.phase).toBe('EXECUTING')
    expect(state.handVersion).toBe(0)
    expect(canProgram(state)).toBe(false)
  })

  it('replaces old state on join and preserves accepted submission status', () => {
    const state = gameStateReducer(selectProgram(), {
      type: 'joined', result: { ...result, programSubmitted: true },
    })
    expect(state.registers).toEqual(emptyRegisters)
    expect(state.submission).toBe('accepted')
    expect(canProgram(state)).toBe(false)
    expect(gameStateReducer(state, { type: 'reset' })).toEqual(createClientGameState())
  })
})

function selectProgram(state = programmingState()): ClientGameState {
  for (const [registerIndex, cardId] of selectedCardIds.entries()) {
    state = gameStateReducer(state, { type: 'place', cardId, registerIndex })
  }
  return state
}

describe('placeCard', () => {
  it('places a card without changing the original registers', () => {
    const result = placeCard(emptyRegisters, firstCard, 2)

    expect(result).toEqual([null, null, firstCard, null, null])
    expect(result).not.toBe(emptyRegisters)
    expect(emptyRegisters).toEqual([null, null, null, null, null])
  })

  it('rejects occupied, duplicate, and invalid placements', () => {
    const occupiedRegisters = placeCard(emptyRegisters, firstCard, 0)

    expect(placeCard(occupiedRegisters, secondCard, 0)).toBe(
      occupiedRegisters,
    )
    expect(placeCard(occupiedRegisters, firstCard, 1)).toBe(
      occupiedRegisters,
    )
    expect(placeCard(emptyRegisters, firstCard, -1)).toBe(emptyRegisters)
    expect(placeCard(emptyRegisters, firstCard, REGISTER_COUNT)).toBe(
      emptyRegisters,
    )
    expect(placeCard(emptyRegisters, firstCard, 1.5)).toBe(emptyRegisters)
  })
})

describe('removeCard', () => {
  it('removes a card without changing the original registers', () => {
    const occupiedRegisters = placeCard(emptyRegisters, firstCard, 2)
    const result = removeCard(occupiedRegisters, 2)

    expect(result).toEqual(emptyRegisters)
    expect(result).not.toBe(occupiedRegisters)
    expect(occupiedRegisters[2]).toBe(firstCard)
  })

  it('preserves the registers when no card can be removed', () => {
    expect(removeCard(emptyRegisters, 0)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, -1)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, REGISTER_COUNT)).toBe(emptyRegisters)
    expect(removeCard(emptyRegisters, 1.5)).toBe(emptyRegisters)
  })
})

describe('client game state', () => {
  it('keeps programming locked until joined', () => {
    let state = createClientGameState()
    expect(state.assignment).toBeNull()
    expect(state.phase).toBeNull()
    expect(canProgram(state)).toBe(false)
    state = gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })
    expect(state.registers).toEqual(emptyRegisters)
    expect(createSubmission(state)).toBeNull()

    state = gameStateReducer(state, { type: 'joined', result })
    expect(state.board).not.toBeNull()
    expect(state.playback.robots).toMatchObject(publicState.robots)
    expect(canProgram(state)).toBe(true)
  })

  it('requires an assignment even with a hand and a selected program', () => {
    const state = { ...selectProgram(), assignment: null }
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    expect(gameStateReducer(state, { type: 'dealt', cards }).phase).toBeNull()
  })

  it('uses the assignment game identity for submission', () => {
    const assignment = { ...result.assignment, gameId: '40000000-0000-4000-8000-000000000002' }
    const state = selectProgram(gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, assignment },
    }))
    expect(createSubmission(state)).toEqual({
      gameId: assignment.gameId,
      cardIds: selectedCardIds,
    })
  })

  it('requires a dealt hand and disables editing when execution starts', () => {
    let state = gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, hand: [] },
    })
    expect(canProgram(state)).toBe(false)

    state = gameStateReducer(state, { type: 'dealt', cards })
    state = selectProgram(state)
    const registers = state.registers
    expect(gameStateReducer(state, { type: 'submitted', playerId: 'unknown-player' })).toBe(state)
    state = gameStateReducer(state, {
      type: 'submitted',
      playerId: publicState.robots[0].playerId,
    })

    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    state = gameStateReducer(state, { type: 'remove', registerIndex: 0 })
    expect(state.registers).toEqual(registers)
  })

  it('only places cards from the hand and needs five selected cards to submit', () => {
    let state = programmingState()
    state = gameStateReducer(state, {
      type: 'place',
      cardId: '10000000-0000-4000-8000-000000000099',
      registerIndex: 0,
    })
    expect(state.registers).toEqual(emptyRegisters)
    expect(createSubmission(state)).toBeNull()

    for (const [registerIndex, cardId] of selectedCardIds.entries()) {
      expect(createSubmission(state)).toBeNull()
      state = gameStateReducer(state, { type: 'place', cardId, registerIndex })
    }
    expect(createSubmission(state)).toEqual({
      gameId: publicState.gameId,
      cardIds: selectedCardIds,
    })

    state = gameStateReducer(state, { type: 'remove', registerIndex: 2 })
    expect(createSubmission(state)).toBeNull()
    state = gameStateReducer(state, { type: 'place', cardId: cards[5].id, registerIndex: 2 })
    expect(createSubmission(state)?.cardIds).toEqual([
      selectedCardIds[0],
      selectedCardIds[1],
      cards[5].id,
      selectedCardIds[3],
      selectedCardIds[4],
    ])
  })

  it('freezes edits and duplicate submissions from send through acceptance', () => {
    let state = selectProgram()
    const registers = state.registers
    const handVersion = state.handVersion
    state = gameStateReducer(state, { type: 'submit' })

    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    state = gameStateReducer(state, { type: 'remove', registerIndex: 0 })
    state = gameStateReducer(state, { type: 'place', cardId: cards[5].id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'submit' })
    expect(state.registers).toEqual(registers)
    expect(createSubmission(state)).toBeNull()

    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'ACCEPTED' },
      handVersion,
    })
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    expect(state.registers).toEqual(registers)
  })

  it('preserves a rejected selection and allows it to be retried', () => {
    let state = selectProgram()
    const submission = createSubmission(state)
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'INVALID_PROGRAM' },
      handVersion: state.handVersion,
    })

    expect(canProgram(state)).toBe(true)
    expect(createSubmission(state)).toEqual(submission)
    state = gameStateReducer(state, { type: 'submit' })
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
  })

  it('preserves an unacknowledged selection without allowing a duplicate resend', () => {
    let state = selectProgram()
    const registers = state.registers
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'submission-unknown',
      handVersion: state.handVersion,
    })

    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    expect(state.registers).toEqual(registers)
    state = gameStateReducer(state, { type: 'remove', registerIndex: 0 })
    state = gameStateReducer(state, { type: 'submit' })
    expect(state.registers).toEqual(registers)
    expect(createSubmission(state)).toBeNull()
  })

  it('ignores old acknowledgements without locking or unlocking the next hand', () => {
    let state = selectProgram()
    const previousVersion = state.handVersion
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, { type: 'dealt', cards })

    expect(state.registers).toEqual(emptyRegisters)
    expect(canProgram(state)).toBe(true)
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'ACCEPTED' },
      handVersion: previousVersion,
    })
    state = gameStateReducer(state, {
      type: 'submission-unknown',
      handVersion: previousVersion,
    })
    expect(canProgram(state)).toBe(true)

    state = selectProgram(state)
    const submission = createSubmission(state)
    expect(submission).toEqual({
      gameId: publicState.gameId,
      cardIds: selectedCardIds,
    })
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'INVALID_PROGRAM' },
      handVersion: previousVersion,
    })
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()

    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'INVALID_PROGRAM' },
      handVersion: state.handVersion,
    })
    expect(createSubmission(state)).toEqual(submission)
  })

  it('displays all five burst actions before unlocking the next programming hand', () => {
    let state = selectProgram()
    expect(state.playback.robots.find((robot) => robot.robotId === robotId)?.position)
      .toEqual(publicState.robots[0].position)
    state = gameStateReducer(state, { type: 'submit' })
    for (const action of actions) {
      state = gameStateReducer(state, { type: 'action', action })
    }

    state = gameStateReducer(state, { type: 'dealt', cards })
    expect(state.registers).toEqual(emptyRegisters)

    const displayedAngles = [0, -90, -90, -180, -180]
    for (const [index, action] of actions.entries()) {
      expect(state.playback.robots.find((robot) => robot.robotId === robotId))
        .toMatchObject({ position: action.position, angle: displayedAngles[index] })
      expect(state.playback.robots.find((robot) => robot.robotId === stationaryRobotId)?.position)
        .toEqual(publicState.robots[1].position)
      expect(canProgram(state)).toBe(false)
      expect(createSubmission(state)).toBeNull()
      state = gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })
      expect(state.registers).toEqual(emptyRegisters)
      state = gameStateReducer(state, { type: 'complete' })
    }

    expect(canProgram(state)).toBe(true)
    state = selectProgram(state)
    expect(createSubmission(state)).toEqual({
      gameId: publicState.gameId,
      cardIds: selectedCardIds,
    })
    expect(state.playback.robots.find((robot) => robot.robotId === robotId)?.position)
      .toEqual(actions[4].position)
  })

  it.each(['idle', 'pending'] as const)('preserves the game and locks editing on connection loss with submission %s', (submission) => {
    const selected = selectProgram()
    const before = submission === 'pending'
      ? gameStateReducer(selected, { type: 'submit' })
      : selected
    let state = gameStateReducer(before, { type: 'disconnected' })

    expect(state).toEqual({
      ...before,
      connected: false,
      error: 'Connection lost. Reload to connect again; your program was not resent.',
    })
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    state = gameStateReducer(state, { type: 'remove', registerIndex: 0 })
    state = gameStateReducer(state, { type: 'place', cardId: cards[5].id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'submit' })
    expect(state.registers).toEqual(before.registers)
    expect(state.submission).toBe(submission)
    expect(createSubmission(state)).toBeNull()
  })

  it('initializes a fresh connected game after disconnect', () => {
    const disconnected = gameStateReducer(selectProgram(), { type: 'disconnected' })
    const state = gameStateReducer(disconnected, { type: 'joined', result })

    expect(state.connected).toBe(true)
    expect(state.error).toBeNull()
    expect(state.registers).toEqual(emptyRegisters)
    expect(canProgram(state)).toBe(true)
  })
})
