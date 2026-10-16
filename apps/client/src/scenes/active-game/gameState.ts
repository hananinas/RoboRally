import type {
  Card,
  CardsDealt,
  GamePhase,
  JoinResult,
  PlayerAssignment,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  PlayerId,
  PlayerJoined,
  PlayerLeft,
  ProgramResult,
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

export type Player = {
  playerId: PlayerId
  lastCheckpoint: number
  username: string
  connected: boolean
}

export type ClientGameState = {
  connected: boolean
  assignment: PlayerAssignment | null
  phase: GamePhase | null
  paused: boolean
  players: readonly Player[]
  checkpointCount: number
  board: BoardRenderModel | null
  playback: RobotPlaybackState
  hand: readonly ProgramCard[]
  registers: Registers
  registersPast: readonly Registers[]
  registersFuture: readonly Registers[]
  // Copy of the submitted program shown while its actions play back.
  playbackProgram: Registers | null
  handVersion: number
  handReady: boolean
  pendingHand: CardsDealt | null
  submission: 'idle' | 'pending' | 'accepted' | 'uncertain'
  error: string | null
}

export type GameStateEvent =
  | { type: 'joined'; result: Extract<JoinResult, { outcome: 'JOINED' }> }
  | { type: 'player-joined'; payload: PlayerJoined }
  | { type: 'player-left'; payload: PlayerLeft }
  | { type: 'player-connection-changed'; payload: PlayerConnectionChanged }
  | { type: 'checkpoint-progress'; payload: PlayerCheckpointProgress }
  | { type: 'disconnected' }
  | { type: 'reconnected' }
  | { type: 'connect-error'; message: string }
  | { type: 'dealt'; hand: CardsDealt }
  | { type: 'reset' }
  | { type: 'error'; message: string }
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

export const USER_ALREADY_IN_GAME_MESSAGE =
  'This username is already participating from another connection.'

const connectErrors: Record<string, string> = {
  USER_ALREADY_IN_GAME: USER_ALREADY_IN_GAME_MESSAGE,
}

export const REGISTER_COUNT = 5

function emptyRegisters(): Registers {
  return Array.from({ length: REGISTER_COUNT }, () => null)
}

export function createClientGameState(): ClientGameState {
  return {
    connected: false,
    assignment: null,
    phase: null,
    paused: false,
    players: [],
    checkpointCount: 0,
    board: null,
    playback: createRobotPlaybackState([]),
    hand: [],
    registers: emptyRegisters(),
    registersPast: [],
    registersFuture: [],
    playbackProgram: null,
    handVersion: 0,
    handReady: false,
    pendingHand: null,
    submission: 'idle',
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected &&
    !state.paused &&
    state.assignment !== null &&
    state.phase === 'PROGRAMMING' &&
    state.handReady &&
    state.hand.length > 0 &&
    !state.playback.active &&
    state.submission === 'idle'
}

export function createSubmission(state: ClientGameState): SubmitProgram | null {
  if (!canProgram(state) || state.assignment === null) return null
  const [first, second, third, fourth, fifth] = state.registers
  if (!first || !second || !third || !fourth || !fifth) return null
  return {
    gameId: state.assignment.gameId,
    playerId: state.assignment.playerId,
    cardIds: [first.id, second.id, third.id, fourth.id, fifth.id],
  }
}

function isHandEligible(state: ClientGameState, hand: CardsDealt): boolean {
  return hand.gameId === state.assignment?.gameId &&
    hand.playerId === state.assignment.playerId
}

// Keep the next hand pending until the previous round has finished playing.
function activateHand(state: ClientGameState): ClientGameState {
  const hand = state.pendingHand
  if (!hand) return state
  if (!isHandEligible(state, hand)) return { ...state, pendingHand: null }
  if (state.phase !== 'PROGRAMMING' || state.playback.active) {
    return state
  }
  return {
    ...state,
    hand: hand.cards,
    handReady: true,
    handVersion: state.handVersion + 1,
    pendingHand: null,
    registers: emptyRegisters(),
    registersPast: [],
    registersFuture: [],
    playbackProgram: null,
    submission: 'idle',
    error: state.connected ? null : state.error,
  }
}

export function gameStateReducer(
  state: ClientGameState,
  event: GameStateEvent,
): ClientGameState {
  switch (event.type) {
    case 'error':
      return { ...state, error: event.message }
    case 'player-joined': {
      const { gameId, player, robot } = event.payload
      if (gameId !== state.assignment?.gameId || player.playerId !== robot.playerId ||
          state.players.some((candidate) => candidate.playerId === player.playerId)) return state
      return {
        ...state,
        players: [...state.players, {
          playerId: player.playerId, username: player.username, connected: player.connected,
          lastCheckpoint: player.lastCheckpoint,
        }],
        playback: robotPlaybackReducer(state.playback, { type: 'add', robot: { ...robot, colour: '#c74f4f' } }),
      }
    }
    case 'player-left': {
      const { gameId, playerId, robotId } = event.payload
      if (gameId !== state.assignment?.gameId ||
        !state.players.some((player) => player.playerId === playerId)) return state
      return {
        ...state,
        players: state.players.filter((player) => player.playerId !== playerId),
        playback: robotPlaybackReducer(state.playback, { type: 'remove', robotId }),
      }
    }
    case 'checkpoint-progress': {
      const { gameId, playerId, lastCheckpoint, checkpointCount } = event.payload
      const player = state.players.find((candidate) => candidate.playerId === playerId)
      if (gameId !== state.assignment?.gameId || !player ||
          !Number.isSafeInteger(lastCheckpoint) || !Number.isSafeInteger(checkpointCount) ||
          lastCheckpoint > checkpointCount || lastCheckpoint <= player.lastCheckpoint) return state
      return {
        ...state,
        checkpointCount,
        players: state.players.map((candidate) =>
          candidate.playerId === playerId ? { ...candidate, lastCheckpoint } : candidate),
      }
    }
    case 'player-connection-changed': {
      const { gameId, playerId, connected, paused } = event.payload
      if (gameId !== state.assignment?.gameId) return state
      return {
        ...state,
        paused,
        players: state.players.map((player) =>
          player.playerId === playerId ? { ...player, connected } : player),
      }
    }
    case 'disconnected':
      return {
        ...state,
        connected: false,
        error: 'Connection lost. Reconnecting… Your program was not resent.',
      }
    case 'reconnected':
      return { ...state, connected: true, error: null }
    case 'connect-error': {
      const message = connectErrors[event.message]
      return message ? { ...state, error: message } : state
    }
    case 'reset':
      return createClientGameState()
    case 'joined': {
      const { result } = event
      const snapshot = result.state
      return {
        ...createClientGameState(),
        connected: true,
        assignment: result.assignment,
        hand: result.hand,
        handVersion: result.hand.length > 0 ? 1 : 0,
        handReady: snapshot.phase === 'PROGRAMMING' && result.hand.length > 0,
        submission: result.programSubmitted ? 'accepted' : 'idle',
        phase: snapshot.phase,
        paused: snapshot.paused,
        checkpointCount: snapshot.checkpointCount,
        players: snapshot.players.map((player) => ({
          playerId: player.playerId, username: player.username, connected: player.connected,
          lastCheckpoint: player.lastCheckpoint,
        })),
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
    case 'dealt': {
      const hand = event.hand
      if (!isHandEligible(state, hand) ||
        (state.phase === 'PROGRAMMING' && (state.handReady || state.pendingHand))) return state
      return activateHand({
        ...state,
        phase: 'PROGRAMMING',
        handReady: false,
        pendingHand: hand,
      })
    }
    case 'action':
      if (event.action.gameId !== state.assignment?.gameId ||
        !state.playback.robots.some((robot) => robot.robotId === event.action.robotId)) return state
      return {
        ...state,
        phase: 'EXECUTING',
        handReady: false,
        pendingHand: null,
        playbackProgram: state.playbackProgram ??
          (state.registers.some((card) => card !== null) ? state.registers : null),
        playback: robotPlaybackReducer(state.playback, { type: 'enqueue', action: event.action }),
      }
    case 'complete': {
      const playback = robotPlaybackReducer(state.playback, { type: 'complete' })
      if (playback.active) return { ...state, playback }
      if (state.phase !== 'PROGRAMMING') return { ...state, playback }
      return activateHand({
        ...state,
        playback,
        playbackProgram: null,
        registers: state.playbackProgram ? emptyRegisters() : state.registers,
      })
    }
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
    case 'result': {
      if (event.handVersion !== state.handVersion || state.submission !== 'pending') return state
      if (event.result.outcome === 'ACCEPTED') {
        return { ...state, submission: 'accepted', error: null }
      }
      const error = event.result.outcome === 'GAME_PAUSED'
        ? 'Game paused. Your program was not submitted — try again once reconnected.'
        : 'Program rejected. Adjust your selection and try again.'
      return { ...state, submission: 'idle', error }
    }
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
