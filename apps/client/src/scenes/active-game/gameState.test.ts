import type {
  Card,
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
  antenna: { x: 2, y: 0, angle: Math.PI / 2 },
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
  { gameId: publicState.gameId, registerIndex: 0, robotId, instruction: 'MOVE_1', position: { coordinate: { x: 2, y: 2 }, orientation: 'NORTH' } },
  { gameId: publicState.gameId, registerIndex: 1, robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 2, y: 2 }, orientation: 'WEST' } },
  { gameId: publicState.gameId, registerIndex: 2, robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 2 }, orientation: 'WEST' } },
  { gameId: publicState.gameId, registerIndex: 3, robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 1, y: 2 }, orientation: 'SOUTH' } },
  { gameId: publicState.gameId, registerIndex: 4, robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 3 }, orientation: 'SOUTH' } },
]
const hand = { gameId: publicState.gameId, playerId: publicState.robots[0].playerId, cards }

function changePhase(state: ClientGameState, phase: 'PROGRAMMING' | 'EXECUTING') {
  return gameStateReducer(state, { type: 'phase', phase: { gameId: publicState.gameId, phase } })
}

function programmingState(): ClientGameState {
  let state = gameStateReducer(createClientGameState(), { type: 'connected' })
  state = gameStateReducer(state, { type: 'initial-state', state: publicState })
  return gameStateReducer(state, { type: 'dealt', hand })
}

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
  it('does not apply an early hand belonging to another game', () => {
    let state = gameStateReducer(createClientGameState(), { type: 'connected' })
    state = gameStateReducer(state, { type: 'dealt', hand: { ...hand, gameId: 'another-game' } })
    state = gameStateReducer(state, { type: 'initial-state', state: publicState })
    expect(state.playerId).toBeNull()
    expect(state.hand).toEqual([])
    expect(canProgram(state)).toBe(false)
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(canProgram(state)).toBe(true)
    expect(state.playerId).toBe(hand.playerId)
  })

  it('keeps an early hand locked and initializes robots from the first snapshot', () => {
    let state = gameStateReducer(createClientGameState(), { type: 'connected' })
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(state.gameId).toBeNull()
    expect(state.phase).toBeNull()
    expect(canProgram(state)).toBe(false)
    state = gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })
    expect(state.registers).toEqual(emptyRegisters)
    expect(createSubmission(state)).toBeNull()

    state = gameStateReducer(state, { type: 'initial-state', state: publicState })
    expect(state.board).not.toBeNull()
    expect(state.playback.robots).toMatchObject(publicState.robots)
    expect(canProgram(state)).toBe(true)
  })

  it('requires a dealt hand and disables editing when execution starts', () => {
    let state = gameStateReducer(createClientGameState(), { type: 'connected' })
    state = gameStateReducer(state, { type: 'initial-state', state: publicState })
    expect(canProgram(state)).toBe(false)

    state = gameStateReducer(state, { type: 'dealt', hand })
    state = selectProgram(state)
    const registers = state.registers
    state = changePhase(state, 'EXECUTING')

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
      playerId: hand.playerId,
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

  it('does not erase a selected program when the same hand is dealt again', () => {
    const state = selectProgram()
    const submission = createSubmission(state)

    const duplicate = gameStateReducer(state, {
      type: 'dealt',
      hand,
    })

    expect(duplicate.registers).toEqual(state.registers)
    expect(createSubmission(duplicate)).toEqual(submission)
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
    expect(state.submission).toBe('uncertain')

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
    state = changePhase(state, 'EXECUTING')
    state = changePhase(state, 'PROGRAMMING')
    state = gameStateReducer(state, { type: 'dealt', hand })

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
      playerId: hand.playerId,
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
    state = changePhase(state, 'EXECUTING')
    const registers = state.registers
    for (const action of actions) {
      state = gameStateReducer(state, { type: 'action', action })
    }

    state = changePhase(state, 'PROGRAMMING')
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(state.registers).toEqual(registers)

    const displayedAngles = [0, -90, -90, -180, -180]
    for (const [index, action] of actions.entries()) {
      expect(state.playback.robots.find((robot) => robot.robotId === robotId))
        .toMatchObject({ position: action.position, angle: displayedAngles[index] })
      expect(state.playback.robots.find((robot) => robot.robotId === stationaryRobotId)?.position)
        .toEqual(publicState.robots[1].position)
      expect(canProgram(state)).toBe(false)
      expect(createSubmission(state)).toBeNull()
      state = gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })
      expect(state.registers).toEqual(registers)
      state = gameStateReducer(state, { type: 'complete' })
    }

    expect(canProgram(state)).toBe(true)
    state = selectProgram(state)
    expect(createSubmission(state)).toEqual({
      gameId: publicState.gameId,
      playerId: hand.playerId,
      cardIds: selectedCardIds,
    })
    expect(state.playback.robots.find((robot) => robot.robotId === robotId)?.position)
      .toEqual(actions[4].position)
  })

  it('replaces old cards with the next hand only after playback finishes', () => {
    const nextCards: readonly Card[] = cards.map((card) => ({
      id: card.id.replace('10000000', '20000000'),
      instruction: card.instruction === 'MOVE_1' ? 'TURN_LEFT' : 'MOVE_1',
    }))
    let state = selectProgram()
    const previousRegisters = state.registers

    state = changePhase(state, 'EXECUTING')
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'dealt', hand: { ...hand, cards: nextCards } })
    state = changePhase(state, 'PROGRAMMING')

    expect(state.registers).toEqual(previousRegisters)
    expect(canProgram(state)).toBe(false)

    state = gameStateReducer(state, { type: 'complete' })
    expect(state.hand).toEqual(nextCards)
    expect(state.registers).toEqual(emptyRegisters)
    expect(canProgram(state)).toBe(true)

    state = gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })
    expect(state.registers).toEqual(emptyRegisters)

    for (const [registerIndex, card] of nextCards.slice(0, 5).entries()) {
      state = gameStateReducer(state, { type: 'place', cardId: card.id, registerIndex })
    }
    expect(state.registers.slice(0, 5)).toEqual(nextCards.slice(0, 5))
    expect(createSubmission(state)?.cardIds).toEqual(nextCards.slice(0, 5).map((card) => card.id))
  })

  it('requires the matching private hand after the new programming phase', () => {
    let state = selectProgram()
    state = changePhase(state, 'EXECUTING')
    state = changePhase(state, 'PROGRAMMING')
    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    for (const invalidHand of [
      { ...hand, playerId: publicState.robots[1].playerId },
      { ...hand, gameId: 'another-game' },
    ]) {
      expect(gameStateReducer(state, { type: 'dealt', hand: invalidHand })).toBe(state)
    }
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(canProgram(state)).toBe(true)
    expect(state.registers).toEqual(emptyRegisters)
    expect(gameStateReducer(state, { type: 'dealt', hand })).toBe(state)
    expect(gameStateReducer(state, { type: 'action', action: actions[0] })).toBe(state)
    expect(changePhase(state, 'PROGRAMMING')).toBe(state)
    expect(gameStateReducer(state, {
      type: 'phase', phase: { gameId: 'another-game', phase: 'EXECUTING' },
    })).toBe(state)
  })

  it('buffers a next hand until its phase and preserves both robots in the same register', () => {
    let state = selectProgram()
    const registers = state.registers
    const first = actions[0]
    const second: RobotActionResolved = {
      ...first, robotId: stationaryRobotId,
      position: { coordinate: { x: 3, y: 4 }, orientation: 'WEST' },
    }
    state = changePhase(state, 'EXECUTING')
    state = gameStateReducer(state, { type: 'action', action: first })
    state = gameStateReducer(state, { type: 'action', action: second })
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(state.pendingHand).toEqual(hand)
    expect(state.registers).toEqual(registers)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.playback.active).toEqual(second)
    expect(state.playback.robots[0].position).toEqual(first.position)
    expect(state.playback.robots[1].position).toEqual(second.position)
    state = gameStateReducer(state, { type: 'complete' })
    expect(canProgram(state)).toBe(false)
    expect(state.registers).toEqual(registers)
    state = changePhase(state, 'PROGRAMMING')
    expect(canProgram(state)).toBe(true)
    expect(state.registers).toEqual(emptyRegisters)
  })

  it('preserves selection but locks editing and submission on connection loss', () => {
    let state = selectProgram()
    const registers = state.registers
    state = gameStateReducer(state, { type: 'disconnected' })

    expect(canProgram(state)).toBe(false)
    expect(createSubmission(state)).toBeNull()
    state = gameStateReducer(state, { type: 'remove', registerIndex: 0 })
    state = gameStateReducer(state, { type: 'place', cardId: cards[5].id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'submit' })
    expect(state.registers).toEqual(registers)
    expect(createSubmission(state)).toBeNull()
  })
})
