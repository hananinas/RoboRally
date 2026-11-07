import type {
  Card,
  GameInitialization,
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
  moveCard,
  placeCard,
  REGISTER_COUNT,
  removeCard,
  USER_ALREADY_IN_GAME_MESSAGE,
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
  paused: false,
  aborted: false,
  checkpointCount: 0,
  winner: null,
  players: [
    { playerId: '50000000-0000-4000-8000-000000000001', lastCheckpoint: 0, username: 'First', connected: true, programSubmitted: false },
    { playerId: '50000000-0000-4000-8000-000000000002', lastCheckpoint: 0, username: 'Second', connected: true, programSubmitted: false },
  ],
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
      colour: '#A66BE0',
      playerId: '50000000-0000-4000-8000-000000000001',
      position: { coordinate: { x: 2, y: 3 }, orientation: 'NORTH' },
      startPosition: { x: 2, y: 3 },
    },
    {
      robotId: stationaryRobotId,
      colour: '#4DC9C0',
      playerId: '50000000-0000-4000-8000-000000000002',
      position: { coordinate: { x: 4, y: 4 }, orientation: 'EAST' },
      startPosition: { x: 4, y: 4 },
    },
  ],
}
const actions: readonly RobotActionResolved[] = [
  { gameId: publicState.gameId, registerIndex: 0, pushedRobots: [], robotId, instruction: 'MOVE_1', position: { coordinate: { x: 2, y: 2 }, orientation: 'NORTH' } },
  { gameId: publicState.gameId, registerIndex: 1, pushedRobots: [], robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 2, y: 2 }, orientation: 'WEST' } },
  { gameId: publicState.gameId, registerIndex: 2, pushedRobots: [], robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 2 }, orientation: 'WEST' } },
  { gameId: publicState.gameId, registerIndex: 3, pushedRobots: [], robotId, instruction: 'TURN_LEFT', position: { coordinate: { x: 1, y: 2 }, orientation: 'SOUTH' } },
  { gameId: publicState.gameId, registerIndex: 4, pushedRobots: [], robotId, instruction: 'MOVE_1', position: { coordinate: { x: 1, y: 3 }, orientation: 'SOUTH' } },
]
const hand = { gameId: publicState.gameId, playerId: publicState.robots[0].playerId, cards }

const result: GameInitialization = {
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
    expect(state.board?.antenna).toEqual(publicState.antenna)
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

  it('joins an aborted game and gameplay is disabled', () => {
    const state = gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, state: { ...publicState, aborted: true } },
    })
    expect(state.aborted).toBe(true)
    expect(state.error).toBe('This game has encountered an error and cannot continue.')
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

  it('overwrites an occupied register, and rejects duplicate and invalid placements', () => {
    const occupiedRegisters = placeCard(emptyRegisters, firstCard, 0)

    expect(placeCard(occupiedRegisters, secondCard, 0)).toEqual(
      [secondCard, null, null, null, null],
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
describe('moveCard', () => {
  const firstAndLast: Registers = [firstCard, null, null, null, secondCard]

  it('swaps two cards without changing the original registers', () => {
    const result = moveCard(firstAndLast, 0, 4)

    expect(result).toEqual([secondCard, null, null, null, firstCard])
    expect(result).not.toBe(firstAndLast)
    expect(firstAndLast[0]).toBe(firstCard)
  })

  it('moves a card into an empty register', () => {
    expect(moveCard(firstAndLast, 0, 2)).toEqual([null, null, firstCard, null, secondCard])
  })

  it('preserves the registers when no card can be moved', () => {
    expect(moveCard(firstAndLast, 0, 0)).toBe(firstAndLast)
    expect(moveCard(firstAndLast, 1, 4)).toBe(firstAndLast)
    expect(moveCard(firstAndLast, -1, 4)).toBe(firstAndLast)
    expect(moveCard(firstAndLast, 0, REGISTER_COUNT)).toBe(firstAndLast)
    expect(moveCard(firstAndLast, 0, 1.5)).toBe(firstAndLast)
  })

  it('swaps through the reducer, and the swap can be undone', () => {
    let state = programmingState()
    state = gameStateReducer(state, { type: 'place', cardId: firstCard.id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'place', cardId: secondCard.id, registerIndex: 4 })

    const swapped = gameStateReducer(state, { type: 'move', fromIndex: 0, toIndex: 4 })
    expect(swapped.registers[0]).toBe(secondCard)
    expect(swapped.registers[4]).toBe(firstCard)

    expect(gameStateReducer(swapped, { type: 'undo' }).registers).toEqual(state.registers)
  })
})

describe('undo, redo, and clear', () => {
  it('undoes and redoes a placement', () => {
    const empty = programmingState()
    const placed = gameStateReducer(empty, { type: 'place', cardId: firstCard.id, registerIndex: 0 })

    expect(placed.registers[0]).toBe(firstCard)

    const undone = gameStateReducer(placed, { type: 'undo' })
    expect(undone.registers).toEqual(empty.registers)

    const redone = gameStateReducer(undone, { type: 'redo' })
    expect(redone.registers).toEqual(placed.registers)
  })

  it('does nothing when there is no history to undo or redo', () => {
    const state = programmingState()

    expect(gameStateReducer(state, { type: 'undo' })).toBe(state)
    expect(gameStateReducer(state, { type: 'redo' })).toBe(state)
  })

  it('clears the redo history once a new action follows an undo', () => {
    let state = programmingState()
    state = gameStateReducer(state, { type: 'place', cardId: firstCard.id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'undo' })
    state = gameStateReducer(state, { type: 'place', cardId: secondCard.id, registerIndex: 1 })

    expect(gameStateReducer(state, { type: 'redo' })).toBe(state)
  })

  it('clears every register at once, and the clear can be undone', () => {
    let state = programmingState()
    state = gameStateReducer(state, { type: 'place', cardId: firstCard.id, registerIndex: 0 })
    state = gameStateReducer(state, { type: 'place', cardId: secondCard.id, registerIndex: 1 })
    const filled = state

    const cleared = gameStateReducer(state, { type: 'clear' })
    expect(cleared.registers).toEqual(emptyRegisters)
    expect(gameStateReducer(cleared, { type: 'undo' }).registers).toEqual(filled.registers)
    expect(gameStateReducer(cleared, { type: 'clear' })).toBe(cleared)
  })
})

describe('client game state', () => {
  it('ignores private hands before joining', () => {
    const state = createClientGameState()
    expect(gameStateReducer(state, { type: 'dealt', hand })).toBe(state)
  })

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
    expect(gameStateReducer(state, { type: 'dealt', hand })).toBe(state)
  })

  it('requires a dealt hand and disables editing when execution starts', () => {
    let state = gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, hand: [] },
    })
    expect(canProgram(state)).toBe(false)

    state = gameStateReducer(state, { type: 'dealt', hand })
    state = selectProgram(state)
    const registers = state.registers
    for (const invalidAction of [
      { ...actions[0], gameId: 'another-game' },
      { ...actions[0], robotId: 'unknown-robot' },
    ]) {
      state = gameStateReducer(state, { type: 'action', action: invalidAction })
      expect(canProgram(state)).toBe(true)
      expect(state.playback.active).toBeNull()
      expect(state.registers).toEqual(registers)
    }
    state = gameStateReducer(state, { type: 'action', action: actions[0] })

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
    expect(createSubmission(state)).toEqual({ cardIds: selectedCardIds })

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

  it('shows the game-paused message on a paused rejection', () => {
    let state = selectProgram()
    const submission = createSubmission(state)
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'GAME_PAUSED' },
      handVersion: state.handVersion,
    })

    expect(state.submission).toBe('idle')
    expect(state.error).toBe('Game paused. Your program was not submitted — try again once reconnected.')
    expect(createSubmission(state)).toEqual(submission)
  })

  it('treats an already-submitted rejection as accepted', () => {
    let state = selectProgram()
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'ALREADY_SUBMITTED' },
      handVersion: state.handVersion,
    })

    expect(state.submission).toBe('accepted')
    expect(state.error).toBeNull()
    expect(canProgram(state)).toBe(false)
  })

  it('shows the wrong-phase message when the round already moved on', () => {
    let state = selectProgram()
    const submission = createSubmission(state)
    state = gameStateReducer(state, { type: 'submit' })
    state = gameStateReducer(state, {
      type: 'result',
      result: { outcome: 'WRONG_PHASE' },
      handVersion: state.handVersion,
    })

    expect(state.submission).toBe('idle')
    expect(state.error).toBe('The round already moved on before your submission arrived.')
    expect(createSubmission(state)).toEqual(submission)
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
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'complete' })
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
    expect(submission).toEqual({ cardIds: selectedCardIds })
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
    const registers = state.registers
    for (const action of actions) {
      state = gameStateReducer(state, { type: 'action', action })
    }

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
    expect(createSubmission(state)).toEqual({ cardIds: selectedCardIds })
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

    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'dealt', hand: { ...hand, cards: nextCards } })
    state = gameStateReducer(state, { type: 'dealt', hand })

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
    state = gameStateReducer(state, { type: 'dealt', hand: { ...hand, cards: nextCards } })
    expect(state.registers.slice(0, 5)).toEqual(nextCards.slice(0, 5))
    expect(createSubmission(state)?.cardIds).toEqual(nextCards.slice(0, 5).map((card) => card.id))
  })

  it('requires the matching private hand after playback finishes', () => {
    let state = selectProgram()
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'complete' })
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
  })

  it('buffers the next hand until both robots in the same register have played', () => {
    let state = selectProgram()
    const registers = state.registers
    const first = actions[0]
    const second: RobotActionResolved = {
      ...first, robotId: stationaryRobotId,
      position: { coordinate: { x: 3, y: 4 }, orientation: 'WEST' },
    }
    state = gameStateReducer(state, { type: 'action', action: first })
    state = gameStateReducer(state, { type: 'action', action: second })
    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(canProgram(state)).toBe(false)
    expect(state.registers).toEqual(registers)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.playback.active).toEqual(second)
    expect(state.playback.robots[0].position).toEqual(first.position)
    expect(state.playback.robots[1].position).toEqual(second.position)
    expect(canProgram(state)).toBe(false)
    expect(state.registers).toEqual(registers)
    state = gameStateReducer(state, { type: 'complete' })
    expect(canProgram(state)).toBe(true)
    expect(state.registers).toEqual(emptyRegisters)
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
      error: 'Connection lost. Reconnecting… Your program was not resent.',
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

  it('highlights registers in order when all five results arrive in a burst', () => {
    let state = selectProgram()
    const program = state.registers
    for (const action of actions) state = gameStateReducer(state, { type: 'action', action })
    state = gameStateReducer(state, { type: 'dealt', hand })

    for (const [index, action] of actions.entries()) {
      expect(state.playback.active).toEqual(action)
      expect(state.playback.active?.registerIndex).toBe(index)
      expect(state.playbackProgram).toEqual(program)
      expect(canProgram(state)).toBe(false)
      state = gameStateReducer(state, { type: 'complete' })
    }

    expect(state.playback.active).toBeNull()
    expect(state.playbackProgram).toBeNull()
    expect(state.registers).toEqual(emptyRegisters)
    expect(canProgram(state)).toBe(true)
  })

  it('preserves the executed program across a paused playback queue gap', () => {
    let state = selectProgram()
    const program = state.registers
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, {
      type: 'player-connection-changed',
      payload: {
        gameId: publicState.gameId,
        playerId: publicState.players[1].playerId,
        connected: false,
        paused: true,
      },
    })
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.playbackProgram).toEqual(program)
    expect(state.registers).toEqual(program)

    state = gameStateReducer(state, {
      type: 'player-connection-changed',
      payload: {
        gameId: publicState.gameId,
        playerId: publicState.players[1].playerId,
        connected: true,
        paused: false,
      },
    })
    state = gameStateReducer(state, { type: 'action', action: actions[1] })
    expect(state.playbackProgram).toEqual(program)
    expect(state.registers).toEqual(program)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.playbackProgram).toEqual(program)

    state = gameStateReducer(state, { type: 'dealt', hand })
    expect(state.playbackProgram).toBeNull()
    expect(state.registers).toEqual(emptyRegisters)
  })

  it('restores a recovered connection', () => {
    const before = gameStateReducer(selectProgram(), { type: 'submit' })
    const disconnected = gameStateReducer(before, { type: 'disconnected' })
    const state = gameStateReducer(disconnected, { type: 'reconnected' })

    expect(state).toEqual({ ...before, connected: true, error: null })
    expect(canProgram(state)).toBe(false)
  })

  it('reports a recognized connect error in place of the generic disconnect message', () => {
    const disconnected = gameStateReducer(selectProgram(), { type: 'disconnected' })
    const state = gameStateReducer(disconnected, {
      type: 'connect-error', message: 'USER_ALREADY_IN_GAME',
    })

    expect(state).toEqual({ ...disconnected, error: USER_ALREADY_IN_GAME_MESSAGE })
  })

  it('ignores an unrecognized connect error and reports generic disconnect message', () => {
    const disconnected = gameStateReducer(selectProgram(), { type: 'disconnected' })
    const state = gameStateReducer(disconnected, {
      type: 'connect-error', message: 'transport error',
    })

    expect(state).toEqual(disconnected)
  })

  it('locks programming while paused and unlocks once every player reconnects', () => {
    const state = programmingState()
    const otherPlayerId = publicState.players[1].playerId
    expect(canProgram(state)).toBe(true)

    const paused = gameStateReducer(state, {
      type: 'player-connection-changed',
      payload: { gameId: publicState.gameId, playerId: otherPlayerId, connected: false, paused: true },
    })
    expect(paused.paused).toBe(true)
    expect(paused.players.find((player) => player.playerId === otherPlayerId)?.connected).toBe(false)
    expect(canProgram(paused)).toBe(false)

    const resumed = gameStateReducer(paused, {
      type: 'player-connection-changed',
      payload: { gameId: publicState.gameId, playerId: otherPlayerId, connected: true, paused: false },
    })
    expect(resumed.paused).toBe(false)
    expect(canProgram(resumed)).toBe(true)
  })

  it('disables programming and shows an error once the game aborts', () => {
    const state = selectProgram()
    expect(canProgram(state)).toBe(true)

    const aborted = gameStateReducer(state, { type: 'aborted' })
    expect(aborted.aborted).toBe(true)
    expect(aborted.error).toBe('This game has encountered an error and cannot continue.')
    expect(canProgram(aborted)).toBe(false)
  })
})

describe('checkpoint progress', () => {
  const progress = {
    gameId: publicState.gameId, playerId: result.assignment.playerId,
    lastCheckpoint: 1, checkpointCount: 2,
  }

  it('initializes and replaces progress from authoritative join snapshots', () => {
    const snapshot = {
      ...publicState, checkpointCount: 2,
      board: { ...publicState.board, tiles: publicState.board.tiles.map((tile, index) =>
        index < 2 ? { ...tile, checkpointNumber: index + 1 } : tile) },
      players: publicState.players.map((player) => ({ ...player, lastCheckpoint: 1 })),
    }
    const state = gameStateReducer(createClientGameState(), { type: 'joined', result: { ...result, state: snapshot } })
    expect(state.checkpointCount).toBe(2)
    expect(state.board?.cells[0].checkpointNumber).toBe(1)
    expect(state.players.map((player) => player.lastCheckpoint)).toEqual([1, 1])
    const replaced = gameStateReducer(state, { type: 'joined', result })
    expect(replaced.checkpointCount).toBe(0)
    expect(replaced.players.map((player) => player.lastCheckpoint)).toEqual([0, 0])
  })

  it('updates the identified player once its playback action finishes without changing programming', () => {
    let state = selectProgram()
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'action', action: actions[1] })
    const deferred = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    expect(deferred.players.map((player) => player.lastCheckpoint)).toEqual([0, 0])
    expect(deferred.checkpointCount).toBe(0)
    expect(deferred).toEqual({ ...state, deferredProgress: [{ sequence: 1, payload: progress }] })
    expect(deferred.playback).toBe(state.playback)
    const first = gameStateReducer(deferred, { type: 'complete' })
    expect(first.players.map((player) => player.lastCheckpoint)).toEqual([0, 0])
    const updated = gameStateReducer(first, { type: 'complete' })
    expect(updated.players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    expect(updated.checkpointCount).toBe(2)
    expect(updated.deferredProgress).toEqual([])
    expect(updated.registers).toBe(state.registers)
    expect(canProgram(updated)).toBe(false)
    const restored = gameStateReducer(gameStateReducer(updated, { type: 'disconnected' }), { type: 'reconnected' })
    expect(restored.players).toBe(updated.players)
  })

  it('waits for the landing action before applying progress', () => {
    let state = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    expect(state.players[0].lastCheckpoint).toBe(0)
    expect(state.checkpointCount).toBe(0)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.players[0].lastCheckpoint).toBe(1)
    expect(state.checkpointCount).toBe(2)
    expect(state.deferredProgress).toEqual([])
  })

  it('applies progress immediately when playback holds no action for that player', () => {
    const playing = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    const other = { ...progress, playerId: publicState.robots[1].playerId }
    const updated = gameStateReducer(playing, { type: 'checkpoint-progress', payload: other })
    expect(updated.players.map((player) => player.lastCheckpoint)).toEqual([0, 1])
    expect(updated.deferredProgress).toEqual([])
  })

  it('binds progress to an action that pushes the player robot', () => {
    const push = { ...actions[0], robotId: stationaryRobotId, pushedRobots: [
      { robotId, position: { coordinate: { x: 2, y: 1 }, orientation: 'NORTH' as const } },
    ] }
    let state = gameStateReducer(programmingState(), { type: 'action', action: push })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    expect(state.deferredProgress).toEqual([{ sequence: 0, payload: progress }])
  })

  it('falls back to immediate application after the action finished without regressing', () => {
    let state = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'complete' })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: { ...progress, lastCheckpoint: 2 } })
    expect(state.players[0].lastCheckpoint).toBe(2)
    expect(gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })).toBe(state)
  })

  it('does not lower progress when a deferred entry is older than applied progress', () => {
    let state = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    state = { ...state, players: state.players.map((player, index) =>
      index === 0 ? { ...player, lastCheckpoint: 2 } : player) }
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.players[0].lastCheckpoint).toBe(2)
    expect(state.deferredProgress).toEqual([])
  })

  it('applies progress held by an action skipped when its robot leaves', () => {
    let state = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    state = gameStateReducer(state, { type: 'player-left', payload: {
      gameId: publicState.gameId, playerId: publicState.robots[1].playerId, robotId: stationaryRobotId,
    } })
    expect(state.deferredProgress).toHaveLength(1)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.players[0].lastCheckpoint).toBe(1)
  })

  it('clears deferred progress on reset, rejoin and a new hand', () => {
    let state = gameStateReducer(programmingState(), { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: progress })
    expect(state.deferredProgress).toHaveLength(1)
    expect(gameStateReducer(state, { type: 'reset' }).deferredProgress).toEqual([])
    const rejoined = gameStateReducer(state, { type: 'joined', result })
    expect(rejoined.deferredProgress).toEqual([])
    expect(gameStateReducer(rejoined, { type: 'complete' }).players[0].lastCheckpoint).toBe(0)

    const idle = { ...programmingState(), phase: 'EXECUTING' as const, handReady: false,
      deferredProgress: [{ sequence: 7, payload: progress }] }
    const dealt = gameStateReducer(idle, { type: 'dealt', hand })
    expect(dealt.handReady).toBe(true)
    expect(dealt.deferredProgress).toEqual([])
    expect(dealt.players[0].lastCheckpoint).toBe(0)
  })

  it('ignores duplicates, older progress, unrelated games and unknown or departed players', () => {
    const state = gameStateReducer(programmingState(), { type: 'checkpoint-progress', payload: progress })
    for (const payload of [
      progress, { ...progress, lastCheckpoint: 0 },
      { ...progress, gameId: 'another-game', lastCheckpoint: 2 },
      { ...progress, playerId: 'unknown' },
      { ...progress, lastCheckpoint: 3 },
      { ...progress, lastCheckpoint: 1.5 },
      { ...progress, checkpointCount: -1, lastCheckpoint: 2 },
    ]) expect(gameStateReducer(state, { type: 'checkpoint-progress', payload })).toBe(state)
    const departed = gameStateReducer(state, { type: 'player-left', payload: {
      gameId: progress.gameId, playerId: progress.playerId, robotId,
    } })
    expect(gameStateReducer(departed, { type: 'checkpoint-progress', payload: progress })).toBe(departed)
    expect(gameStateReducer(state, { type: 'reset' }).checkpointCount).toBe(0)
  })
})
describe('pit playback', () => {
  const pitState: PublicGameState = {
    ...publicState,
    board: { ...publicState.board, tiles: publicState.board.tiles.map((tile) =>
      tile.position.x === 2 && tile.position.y === 1 ? { ...tile, type: 'PIT' as const } : tile) },
  }
  const joined = () => gameStateReducer(createClientGameState(), {
    type: 'joined', result: { ...result, state: pitState },
  })
  const fall: RobotActionResolved = {
    ...actions[0], instruction: 'MOVE_2', position: { coordinate: { x: 0, y: 4 }, orientation: 'NORTH' },
  }

  it('runs the pit sequence before the action completes', () => {
    let state = gameStateReducer(joined(), { type: 'action', action: fall })
    expect(state.playback.pitPhase).toBe('move')
    expect(state.playback.robots[0].position.coordinate).toEqual({ x: 2, y: 1 })
    state = gameStateReducer(state, { type: 'checkpoint-progress', payload: {
      gameId: publicState.gameId, playerId: result.assignment.playerId, lastCheckpoint: 1, checkpointCount: 2,
    } })
    state = gameStateReducer(state, { type: 'pit-advance' })
    expect(state.playback.pitPhase).toBe('fall')
    state = gameStateReducer(state, { type: 'pit-advance' })
    expect(state.playback.pitPhase).toBe('respawn')
    expect(state.playback.robots[0].position).toEqual(fall.position)
    expect(state.players[0].lastCheckpoint).toBe(0)
    state = gameStateReducer(state, { type: 'complete' })
    expect(state.playback.active).toBeNull()
    expect(state.players[0].lastCheckpoint).toBe(1)
  })

  it('goes straight to the final position with reduced motion', () => {
    const state = gameStateReducer(joined(), { type: 'action', action: fall, reducedMotion: true })
    expect(state.playback.pitPhase).toBeNull()
    expect(state.playback.robots[0].position).toEqual(fall.position)
    expect(gameStateReducer(state, { type: 'complete' }).playback.active).toBeNull()
  })
})

describe('winning', () => {
  const won = { gameId: publicState.gameId, playerId: result.assignment.playerId, username: 'First' }
  const winner = { playerId: won.playerId, username: won.username }

  it('records the winner from its own game and disables programming', () => {
    const state = gameStateReducer(programmingState(), { type: 'won', payload: won })
    expect(state.winner).toEqual(winner)
    expect(canProgram(state)).toBe(false)
    expect(gameStateReducer(state, { type: 'place', cardId: cards[0].id, registerIndex: 0 })).toBe(state)
  })

  it('ignores other games and a second announcement', () => {
    const state = programmingState()
    expect(gameStateReducer(state, { type: 'won', payload: { ...won, gameId: 'another-game' } })).toBe(state)
    const first = gameStateReducer(state, { type: 'won', payload: won })
    const other = { ...won, playerId: publicState.players[1].playerId, username: 'Second' }
    expect(gameStateReducer(first, { type: 'won', payload: other })).toBe(first)
  })

  it('keeps queued playback running after the announcement', () => {
    let state = selectProgram()
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'won', payload: won })
    expect(state.winner).toEqual(winner)
    expect(state.playback.active).toEqual(actions[0])
  })

  it("keeps the winner's name after the winner leaves", () => {
    const state = gameStateReducer(programmingState(), { type: 'won', payload: won })
    const departed = gameStateReducer(state, { type: 'player-left', payload: {
      gameId: won.gameId, playerId: won.playerId, robotId,
    } })
    expect(departed.players.some((player) => player.playerId === won.playerId)).toBe(false)
    expect(departed.winner).toEqual(winner)
  })

  it('restores the winner from a join snapshot, even after the winner has left', () => {
    const remaining = publicState.players.filter((player) => player.playerId !== won.playerId)
    const state = gameStateReducer(createClientGameState(), {
      type: 'joined', result: { ...result, state: { ...publicState, players: remaining, winner } },
    })
    expect(state.winner).toEqual(winner)
    expect(canProgram(state)).toBe(false)
    expect(gameStateReducer(state, { type: 'reset' }).winner).toBeNull()
  })
})

describe('membership updates', () => {
  it('applies pushed results for a surviving robot when the acting robot is no longer present', () => {
    const position = { coordinate: { x: 3, y: 4 }, orientation: 'EAST' as const }
    const action = {
      ...actions[0], robotId: 'departed-robot', pushedRobots: [{ robotId: stationaryRobotId, position }],
    }
    const state = gameStateReducer(programmingState(), { type: 'action', action })

    expect(state.playback.active).toBe(action)
    expect(state.playback.robots.find((robot) => robot.robotId === stationaryRobotId)?.position).toEqual(position)
    expect(state.playback.robots.some((robot) => robot.robotId === 'departed-robot')).toBe(false)
  })

  it('uses server colours across reordered snapshots and departures, including a fresh reconnect', () => {
    const colours = (state: ClientGameState) => Object.fromEntries(
      state.playback.robots.map((robot) => [robot.robotId, robot.colour]),
    )
    const initial = programmingState()
    expect(colours(initial)).toEqual({ [robotId]: '#A66BE0', [stationaryRobotId]: '#4DC9C0' })
    const reordered = gameStateReducer(initial, { type: 'joined', result: {
      ...result, state: { ...publicState, robots: [...publicState.robots].reverse() },
    } })
    expect(colours(reordered)).toEqual(colours(initial))
    const departed = gameStateReducer(reordered, { type: 'player-left', payload: {
      gameId: publicState.gameId, playerId: publicState.robots[0].playerId, robotId,
    } })
    const reconnected = gameStateReducer(createClientGameState(), { type: 'joined', result: {
      ...result, assignment: { ...result.assignment,
        playerId: publicState.robots[1].playerId, robotId: stationaryRobotId },
      state: { ...publicState,
        players: publicState.players.slice(1), robots: publicState.robots.slice(1) },
    } })
    expect(colours(reconnected)).toEqual(colours(departed))
    expect(colours(reconnected)).toEqual({ [stationaryRobotId]: '#4DC9C0' })
  })

  it('removes a departed robot and its queued actions without disturbing another robot', () => {
    let state = programmingState()
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    state = gameStateReducer(state, { type: 'action', action: { ...actions[0], robotId: stationaryRobotId } })
    const payload = { gameId: publicState.gameId, playerId: publicState.robots[1].playerId, robotId: stationaryRobotId }
    const updated = gameStateReducer(state, { type: 'player-left', payload })
    expect(updated.players.map((player) => player.playerId)).not.toContain(publicState.robots[1].playerId)
    expect(updated.playback.robots.some((robot) => robot.robotId === stationaryRobotId)).toBe(false)
    expect(updated.playback.pending).toEqual([])
    expect(updated.playback.active).toBe(state.playback.active)
    expect(gameStateReducer(updated, { type: 'player-left', payload })).toBe(updated)
    expect(gameStateReducer(state, { type: 'player-left', payload: { ...payload, gameId: 'other' } })).toBe(state)
  })

  it('continues with the next queued action when the active robot leaves', () => {
    let state = programmingState()
    state = gameStateReducer(state, { type: 'action', action: actions[0] })
    const next = { ...actions[0], robotId: stationaryRobotId }
    state = gameStateReducer(state, { type: 'action', action: next })
    const updated = gameStateReducer(state, { type: 'player-left', payload: {
      gameId: publicState.gameId, playerId: result.assignment.playerId, robotId,
    } })
    expect(updated.playback.active).toBe(next)
    expect(updated.playback.robots.some((robot) => robot.robotId === robotId)).toBe(false)
  })
})
