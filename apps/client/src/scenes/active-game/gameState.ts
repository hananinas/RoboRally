import type {
  Card,
  Instruction,
  ProgramResult,
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
  publicState: PublicGameState | null
  board: BoardRenderModel | null
  playback: RobotPlaybackState
  hand: readonly ProgramCard[]
  registers: Registers
  hasHand: boolean
  handStateReady: boolean
  handVersion: number
  submission: 'idle' | 'pending' | 'accepted' | 'uncertain'
  error: string | null
}

export type GameStateEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }
  | { type: 'state'; state: PublicGameState }
  | { type: 'dealt'; cards: readonly Card[] }
  | { type: 'submitted'; playerId: string }
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
    publicState: null,
    board: null,
    playback: createRobotPlaybackState([]),
    hand: [],
    registers: emptyRegisters(),
    hasHand: false,
    handStateReady: false,
    handVersion: 0,
    submission: 'idle',
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected && state.publicState?.phase === 'PROGRAMMING' &&
    state.hasHand && state.handStateReady && !state.playback.active && state.submission === 'idle'
}

export function createSubmission(state: ClientGameState): SubmitProgram | null {
  if (!canProgram(state) || !state.publicState) return null
  const [first, second, third, fourth, fifth] = state.registers
  if (!first || !second || !third || !fourth || !fifth) return null
  return {
    gameId: state.publicState.gameId,
    cardIds: [first.id, second.id, third.id, fourth.id, fifth.id],
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
    case 'state': {
      const snapshot = event.state
      return {
        ...state,
        publicState: snapshot,
        handStateReady: state.hasHand && snapshot.phase === 'PROGRAMMING',
        // A round-end snapshot must not skip the actions still being displayed.
        playback: state.publicState ? state.playback : createRobotPlaybackState(
          snapshot.robots.map((robot) => ({ ...robot, colour: '#c74f4f' })),
        ),
        board: state.board ?? createBoardRenderModel(
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
      }
    }
    case 'dealt':
      return {
        ...state,
        hand: event.cards.map((card) => ({ id: card.id, label: cardLabels[card.instruction] })),
        hasHand: true,
        handStateReady: false,
        handVersion: state.handVersion + 1,
        registers: emptyRegisters(),
        submission: 'idle',
        error: null,
      }
    case 'submitted':
      if (!state.publicState?.robots.some((robot) => robot.playerId === event.playerId)) return state
      return {
        ...state,
        submission: 'accepted',
        publicState: { ...state.publicState, phase: 'EXECUTING' },
        error: null,
      }
    case 'action':
      return {
        ...state,
        playback: robotPlaybackReducer(state.playback, { type: 'enqueue', action: event.action }),
      }
    case 'complete':
      return { ...state, playback: robotPlaybackReducer(state.playback, { type: 'complete' }) }
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
      if (event.handVersion !== state.handVersion ||
        (state.submission !== 'pending' && state.submission !== 'uncertain')) return state
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
