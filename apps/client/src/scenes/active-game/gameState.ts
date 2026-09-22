import type {
  CardsDealt,
  GameId,
  GamePhase,
  Instruction,
  PhaseChanged,
  PlayerId,
  ProgramResult,
  ProgramSubmitted,
  PublicGameState,
  RobotActionResolved,
  SubmitProgram,
} from '@robo-rally/game-events'
import { createBoardRenderModel, type BoardRenderModel } from './board/boardModel.ts'
import {
  createRobotPlaybackState,
  robotPlaybackReducer,
  type RobotPlaybackState,
} from './board/robotPlayback.ts'

export type ProgramCard = {
  id: string
  label: string
}

export type Registers = readonly (ProgramCard | null)[]

export type ClientGameState = {
  connected: boolean
  gameId: GameId | null
  phase: GamePhase | null
  roundNumber: number | null
  playerId: PlayerId | null
  submittedPlayerIds: readonly PlayerId[]
  playerIds: readonly PlayerId[]
  board: BoardRenderModel | null
  playback: RobotPlaybackState
  hand: readonly ProgramCard[]
  registers: Registers
  handVersion: number
  handRoundNumber: number | null
  pendingHand: CardsDealt | null
  submission: 'idle' | 'pending' | 'accepted' | 'uncertain'
  error: string | null
}

export type GameStateEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }
  | { type: 'initial-state'; state: PublicGameState }
  | { type: 'dealt'; hand: CardsDealt }
  | { type: 'submitted'; submission: ProgramSubmitted }
  | { type: 'phase'; phase: PhaseChanged }
  | { type: 'action'; action: RobotActionResolved }
  | { type: 'complete' }
  | { type: 'place'; cardId: string; registerIndex: number }
  | { type: 'remove'; registerIndex: number }
  | { type: 'submit' }
  | { type: 'result'; result: ProgramResult; handVersion: number }
  | { type: 'submission-unknown'; handVersion: number }

export const REGISTER_COUNT = 5

const cardLabels: Record<Instruction, string> = {
  MOVE_1: 'Move 1',
  TURN_LEFT: 'Turn Left',
}

function emptyRegisters(): Registers {
  return Array.from({ length: REGISTER_COUNT }, () => null)
}

export function createClientGameState(): ClientGameState {
  return {
    connected: false,
    gameId: null,
    phase: null,
    roundNumber: null,
    playerId: null,
    submittedPlayerIds: [],
    playerIds: [],
    board: null,
    playback: createRobotPlaybackState([]),
    hand: [],
    registers: emptyRegisters(),
    handVersion: 0,
    handRoundNumber: null,
    pendingHand: null,
    submission: 'idle',
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected &&
    state.phase === 'PROGRAMMING' &&
    state.playerId !== null &&
    state.handRoundNumber === state.roundNumber &&
    !state.playback.active &&
    state.submission === 'idle'
}

export function createSubmission(state: ClientGameState): SubmitProgram | null {
  if (!canProgram(state) || state.gameId === null || state.playerId === null || state.roundNumber === null) return null
  const [first, second, third, fourth, fifth] = state.registers
  if (!first || !second || !third || !fourth || !fifth) return null
  return {
    gameId: state.gameId,
    roundNumber: state.roundNumber,
    playerId: state.playerId,
    cardIds: [first.id, second.id, third.id, fourth.id, fifth.id],
  }
}

function isHandEligible(state: ClientGameState, hand: CardsDealt): boolean {
  if (hand.gameId !== state.gameId || state.roundNumber === null) return false
  if (hand.roundNumber < state.roundNumber || hand.roundNumber > state.roundNumber + 1) return false
  return state.playerIds.includes(hand.playerId) &&
    (state.playerId === null || hand.playerId === state.playerId)
}

// A hand can arrive before its phase or while the previous round is still playing.
function activateHand(state: ClientGameState): ClientGameState {
  const hand = state.pendingHand
  if (!hand || !isHandEligible(state, hand)) return state
  if (hand.roundNumber !== state.roundNumber || state.phase !== 'PROGRAMMING' || state.playback.active) {
    return state.playerId === null ? { ...state, playerId: hand.playerId } : state
  }
  return {
    ...state,
    playerId: hand.playerId,
    hand: hand.cards.map((card) => ({ id: card.id, label: cardLabels[card.instruction] })),
    handRoundNumber: hand.roundNumber,
    handVersion: state.handVersion + 1,
    pendingHand: null,
    registers: emptyRegisters(),
    submission: 'idle',
    error: state.connected ? null : state.error,
  }
}

export function gameStateReducer(
  state: ClientGameState,
  event: GameStateEvent,
): ClientGameState {
  switch (event.type) {
    case 'connected':
      return { ...state, connected: true, error: null }
    case 'disconnected':
      return {
        ...state,
        connected: false,
        error: 'Connection lost. Reload to connect again; your program was not resent.',
      }
    case 'error':
      return { ...state, error: event.message }
    case 'initial-state': {
      const snapshot = event.state
      if (state.gameId !== null) return state
      return activateHand({
        ...state,
        gameId: snapshot.gameId,
        phase: snapshot.phase,
        roundNumber: snapshot.roundNumber,
        playerIds: snapshot.robots.map((robot) => robot.playerId),
        playback: createRobotPlaybackState(
          snapshot.robots.map((robot) => ({ ...robot, colour: '#c74f4f' })),
        ),
        board: createBoardRenderModel(
          snapshot.board.width,
          snapshot.board.height,
          {
            walls: snapshot.board.tiles.map((tile) => ({
              ...tile.position,
              north: tile.walls?.includes('NORTH'),
              east: tile.walls?.includes('EAST'),
              south: tile.walls?.includes('SOUTH'),
              west: tile.walls?.includes('WEST'),
            })),
          },
        ),
      })
    }
    case 'dealt': {
      const hand = event.hand
      if (state.gameId === null) return { ...state, pendingHand: hand }
      if (!isHandEligible(state, hand) || hand.roundNumber === state.handRoundNumber) return state
      return activateHand({ ...state, pendingHand: hand })
    }
    case 'submitted': {
      const submission = event.submission
      if (submission.gameId !== state.gameId || submission.roundNumber !== state.roundNumber ||
        state.phase !== 'PROGRAMMING' || !state.playerIds.includes(submission.playerId) ||
        state.submittedPlayerIds.includes(submission.playerId)) return state
      return { ...state, submittedPlayerIds: [...state.submittedPlayerIds, submission.playerId] }
    }
    case 'phase': {
      const phase = event.phase
      if (phase.gameId !== state.gameId || state.roundNumber === null) return state
      const executing = phase.roundNumber === state.roundNumber &&
        phase.phase === 'EXECUTING' && state.phase === 'PROGRAMMING'
      const nextRound = phase.roundNumber === state.roundNumber + 1 &&
        phase.phase === 'PROGRAMMING' && state.phase === 'EXECUTING'
      if (!executing && !nextRound) return state
      return activateHand({
        ...state,
        phase: phase.phase,
        roundNumber: phase.roundNumber,
        submittedPlayerIds: nextRound ? [] : state.submittedPlayerIds,
      })
    }
    case 'action':
      if (event.action.gameId !== state.gameId || event.action.roundNumber !== state.roundNumber ||
        state.phase !== 'EXECUTING' ||
        !state.playback.robots.some((robot) => robot.robotId === event.action.robotId)) return state
      return {
        ...state,
        playback: robotPlaybackReducer(state.playback, { type: 'enqueue', action: event.action }),
      }
    case 'complete':
      return activateHand({ ...state, playback: robotPlaybackReducer(state.playback, { type: 'complete' }) })
    case 'place': {
      if (!canProgram(state)) return state
      const card = state.hand.find((candidate) => candidate.id === event.cardId)
      if (!card) return state
      const registers = placeCard(state.registers, card, event.registerIndex)
      return registers === state.registers ? state : { ...state, registers }
    }
    case 'remove':
      return canProgram(state)
        ? { ...state, registers: removeCard(state.registers, event.registerIndex) }
        : state
    case 'submit':
      return createSubmission(state) ? { ...state, submission: 'pending', error: null } : state
    case 'result':
      if (event.handVersion !== state.handVersion || state.submission !== 'pending') return state
      return event.result.outcome === 'ACCEPTED'
        ? { ...state, submission: 'accepted', error: null }
        : { ...state, submission: 'idle', error: 'Program rejected. Adjust your selection and try again.' }
    case 'submission-unknown':
      if (event.handVersion !== state.handVersion || state.submission !== 'pending') return state
      return {
        ...state,
        submission: 'uncertain',
        error: 'No submission acknowledgement. Waiting for the server; your program will not be resent.',
      }
  }
}

// Places a card when allowed.
export function placeCard(
  registers: Registers,
  card: ProgramCard,
  registerIndex: number,
): Registers {
  const cannotPlace =
    !Number.isInteger(registerIndex) ||
    registerIndex < 0 ||
    registerIndex >= registers.length ||
    registers[registerIndex] !== null ||
    registers.some((registeredCard) => registeredCard?.id === card.id)

  if (cannotPlace) return registers

  return registers.map((registeredCard, index) =>
    index === registerIndex ? card : registeredCard,
  )
}

// Removes a registered card.
export function removeCard(
  registers: Registers,
  registerIndex: number,
): Registers {
  const cannotRemove =
    !Number.isInteger(registerIndex) ||
    registerIndex < 0 ||
    registerIndex >= registers.length ||
    registers[registerIndex] === null

  if (cannotRemove) return registers

  return registers.map((registeredCard, index) =>
    index === registerIndex ? null : registeredCard,
  )
}

// Checks whether every register is filled.
export function registersAreFilled(registers: Registers): boolean {
  return registers.length === REGISTER_COUNT && registers.every((card) => card !== null)
}
