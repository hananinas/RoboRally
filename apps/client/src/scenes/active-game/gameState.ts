import type {
  Card,
  GameId,
  GamePhase,
  PlayerId,
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

export type ProgramCard = Card

export type Registers = readonly (ProgramCard | null)[]

export type ClientGameState = {
  connected: boolean
  gameId: GameId | null
  phase: GamePhase | null
  playerIds: readonly PlayerId[]
  board: BoardRenderModel | null
  playback: RobotPlaybackState
  hand: readonly ProgramCard[]
  registers: Registers
  registersPast: readonly Registers[]
  registersFuture: readonly Registers[]
  handVersion: number
  submission: 'idle' | 'pending' | 'accepted' | 'uncertain'
  error: string | null
}

export type GameStateEvent =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'error'; message: string }
  | { type: 'initial-state'; state: PublicGameState }
  | { type: 'dealt'; cards: readonly Card[] }
  | { type: 'submitted'; playerId: string }
  | { type: 'action'; action: RobotActionResolved }
  | { type: 'complete' }
  | { type: 'place'; cardId: string; registerIndex: number }
  | { type: 'remove'; registerIndex: number }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'submit' }
  | { type: 'result'; result: ProgramResult; handVersion: number }
  | { type: 'submission-unknown'; handVersion: number }

export const REGISTER_COUNT = 5

function emptyRegisters(): Registers {
  return Array.from({ length: REGISTER_COUNT }, () => null)
}

export function createClientGameState(): ClientGameState {
  return {
    connected: false,
    gameId: null,
    phase: null,
    playerIds: [],
    board: null,
    playback: createRobotPlaybackState([]),
    hand: [],
    registers: emptyRegisters(),
    registersPast: [],
    registersFuture: [],
    handVersion: 0,
    submission: 'idle',
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected &&
    state.phase === 'PROGRAMMING' &&
    state.handVersion > 0 &&
    !state.playback.active &&
    state.submission === 'idle'
}

export function createSubmission(state: ClientGameState): SubmitProgram | null {
  if (!canProgram(state) || state.gameId === null) return null
  const [first, second, third, fourth, fifth] = state.registers
  if (!first || !second || !third || !fourth || !fifth) return null
  return {
    gameId: state.gameId,
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
    case 'initial-state': {
      const snapshot = event.state
      return {
        ...state,
        gameId: snapshot.gameId,
        phase: snapshot.phase,
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
      }
    }
    case 'dealt':
      return {
        ...state,
        hand: event.cards,
        phase: state.gameId === null ? null : 'PROGRAMMING',
        handVersion: state.handVersion + 1,
        registers: emptyRegisters(),
        registersPast: [],
        registersFuture: [],
        submission: 'idle',
        error: null,
      }
    case 'submitted':
      if (!state.playerIds.includes(event.playerId)) return state
      return {
        ...state,
        submission: 'accepted',
        phase: 'EXECUTING',
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
      return registers === state.registers ? state : {
        ...state,
        registers,
        registersPast: [...state.registersPast, state.registers],
        registersFuture: [],
      }
    }
    case 'remove': {
      if (!canProgram(state)) return state
      const registers = removeCard(state.registers, event.registerIndex)
      return registers === state.registers ? state : {
        ...state,
        registers,
        registersPast: [...state.registersPast, state.registers],
        registersFuture: [],
      }
    }
    case 'clear': {
      if (!canProgram(state) || state.registers.every((card) => card === null)) return state
      return {
        ...state,
        registers: emptyRegisters(),
        registersPast: [...state.registersPast, state.registers],
        registersFuture: [],
      }
    }
    case 'undo': {
      if (!canProgram(state) || state.registersPast.length === 0) return state
      const previous = state.registersPast[state.registersPast.length - 1]
      return {
        ...state,
        registers: previous,
        registersPast: state.registersPast.slice(0, -1),
        registersFuture: [...state.registersFuture, state.registers],
      }
    }
    case 'redo': {
      if (!canProgram(state) || state.registersFuture.length === 0) return state
      const next = state.registersFuture[state.registersFuture.length - 1]
      return {
        ...state,
        registers: next,
        registersFuture: state.registersFuture.slice(0, -1),
        registersPast: [...state.registersPast, state.registers],
      }
    }
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
