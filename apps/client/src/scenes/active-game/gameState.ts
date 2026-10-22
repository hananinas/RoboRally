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
  PlayerState,
  PlayerLeft,
  ProgramResult,
  ProgramSubmitted,
  RobotActionResolved,
  SubmitProgram,
} from '@robo-rally/game-events'
import { createBoardRenderModel, type BoardRenderModel } from './board/boardModel.ts'
import {
  createRobotPlaybackState,
  robotPlaybackReducer,
  type RobotPlaybackState,
} from './board/robotPlayback.ts'
import type {
  OpponentPlayer,
  ProgrammingStarted,
  PublicPlayerState,
  PublicRegisters,
  PublicRobotActionResolved,
  RegistersChanged,
} from './publicRegisters.ts'

export type ProgramCard = Card

export type Registers = readonly (ProgramCard | null)[]

export type Player = {
  playerId: PlayerId
  lastCheckpoint: number
  username: string
  connected: boolean
  robotId: string | null
  programSubmitted: boolean
  registers: PublicRegisters | null
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
  aborted: boolean
  error: string | null
}

export type GameStateEvent =
  | { type: 'joined'; result: Extract<JoinResult, { outcome: 'JOINED' }> }
  | { type: 'player-joined'; payload: PlayerJoined }
  | { type: 'player-left'; payload: PlayerLeft }
  | { type: 'player-connection-changed'; payload: PlayerConnectionChanged }
  | { type: 'checkpoint-progress'; payload: PlayerCheckpointProgress }
  | { type: 'registers-changed'; payload: RegistersChanged }
  | { type: 'programming-started'; payload: ProgrammingStarted }
  | { type: 'program-submitted'; payload: ProgramSubmitted }
  | { type: 'disconnected' }
  | { type: 'reconnected' }
  | { type: 'connect-error'; message: string }
  | { type: 'aborted' }
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

const ROBOT_COLOURS = [
  '#c74f4f', // 1. Red
  '#4D8DEB', // 2. Blue
  '#4CAF70', // 3. Green
  '#E5C04D', // 4. Yellow
  '#A66BE0', // 5. Purple
  '#E58B4D', // 6. Orange
  '#4DC9C0', // 7. Cyan
  '#E56FA8', // 8. Pink
  '#8B6548', // 9. Brown
  '#A0A0A0', // 10. Grey
]

function getRobotColour(index: number): string {
  return ROBOT_COLOURS[index % ROBOT_COLOURS.length]
}

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
    aborted: false,
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected &&
    !state.paused &&
    !state.aborted &&
    state.assignment !== null &&
    state.phase === 'PROGRAMMING' &&
    state.handReady &&
    state.hand.length > 0 &&
    !state.playback.active &&
    state.submission === 'idle'
}


export function getOtherPlayers(state: ClientGameState): readonly OpponentPlayer[] {
  return state.players.flatMap((player) => {
    if (player.playerId === state.assignment?.playerId || !player.registers) return []
    const robot = state.playback.robots.find((candidate) => candidate.robotId === player.robotId)
    return robot ? [{ ...player, registers: player.registers, robotId: robot.robotId, colour: robot.colour }] : []
  })
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
    case 'registers-changed': {
      const { gameId, playerId, registers } = event.payload
      if (gameId !== state.assignment?.gameId ||
          !state.players.some((player) => player.playerId === playerId)) return state
      return {
        ...state,
        players: state.players.map((player) => player.playerId === playerId ? { ...player, registers } : player),
      }
    }
    case 'program-submitted': {
      const { gameId, playerId } = event.payload
      if (gameId !== state.assignment?.gameId ||
          !state.players.some((player) => player.playerId === playerId)) return state
      return {
        ...state,
        players: state.players.map((player) => player.playerId === playerId ? { ...player, programSubmitted: true } : player),
      }
    }
    case 'programming-started':
      if (event.payload.gameId !== state.assignment?.gameId) return state
      return activateHand({
        ...state,
        phase: 'PROGRAMMING',
        handReady: false,
        players: state.players.map((player) => ({
          ...player,
          programSubmitted: false,
          registers: [{ status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }],
        })),
      })
    case 'player-joined': {
      const { gameId, player, robot } = event.payload
      if (gameId !== state.assignment?.gameId || player.playerId !== robot.playerId ||
          state.players.some((candidate) => candidate.playerId === player.playerId)) return state
      const colour = getRobotColour(state.players.length)
      return {
        ...state,
        players: [...state.players, {
          playerId: player.playerId, username: player.username, connected: player.connected,
          lastCheckpoint: player.lastCheckpoint,
          robotId: robot.robotId, programSubmitted: player.programSubmitted,
          registers: (player as PlayerState & Partial<Pick<PublicPlayerState, 'registers'>>).registers ?? null,
        }],
        playback: robotPlaybackReducer(state.playback, { type: 'add', robot: { ...robot, colour: colour } }),
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
    case 'aborted':
      return {
        ...state,
        aborted: true,
        error: 'This game has encountered an error and cannot continue.',
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
        aborted: snapshot.aborted,
        error: snapshot.aborted ? 'This game has encountered an error and cannot continue.' : null,
        checkpointCount: snapshot.checkpointCount,
        players: snapshot.players.map((player) => ({
          playerId: player.playerId, username: player.username, connected: player.connected,
          lastCheckpoint: player.lastCheckpoint,
          robotId: snapshot.robots.find((robot) => robot.playerId === player.playerId)?.robotId ?? null,
          programSubmitted: player.programSubmitted,
          registers: (player as PlayerState & Partial<Pick<PublicPlayerState, 'registers'>>).registers ?? null,
        })),
        playback: createRobotPlaybackState(
          snapshot.robots.map((robot,index) => ({ ...robot, colour: getRobotColour(index) })),
        ),
        board: createBoardRenderModel(
          snapshot.board.width,
          snapshot.board.height,
          {
            checkpoints: snapshot.board.tiles.flatMap((tile) => tile.checkpointNumber === undefined
              ? [] : [{ ...tile.position, checkpointNumber: tile.checkpointNumber }]),
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
    case 'action': {
      const actionPlayerId = (event.action as RobotActionResolved & Partial<Pick<PublicRobotActionResolved, 'playerId'>>).playerId
      const player = state.players.find((candidate) => candidate.robotId === event.action.robotId)
      if (event.action.gameId !== state.assignment?.gameId ||
          (actionPlayerId !== undefined && actionPlayerId !== player?.playerId) ||
          !Number.isInteger(event.action.registerIndex) || event.action.registerIndex < 0 ||
          event.action.registerIndex >= REGISTER_COUNT ||
          !state.playback.robots.some((robot) => robot.robotId === event.action.robotId)) return state
      const registers: [...PublicRegisters] | null = player?.registers ? [...player.registers] : null
      if (registers) registers[event.action.registerIndex] = { status: 'REVEALED', instruction: event.action.instruction }
      return {
        ...state,
        phase: 'EXECUTING',
        handReady: false,
        pendingHand: null,
        players: player ? state.players.map((candidate) => candidate.playerId === player.playerId
          ? { ...candidate, registers } : candidate) : state.players,
        playbackProgram: state.playbackProgram ??
          (state.registers.some((card) => card !== null) ? state.registers : null),
        playback: robotPlaybackReducer(state.playback, { type: 'enqueue', action: event.action }),
      }
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
      if (event.result.outcome === 'ACCEPTED' || event.result.outcome === 'ALREADY_SUBMITTED') {
        return { ...state, submission: 'accepted', error: null }
      }
      if (event.result.outcome === 'GAME_PAUSED') {
        return {
          ...state,
          submission: 'idle',
          error: 'Game paused. Your program was not submitted — try again once reconnected.',
        }
      }
      if (event.result.outcome === 'GAME_ABORTED') {
        return {
          ...state,
          submission: 'idle',
          aborted: true,
          error: 'This game has encountered an error and cannot continue.',
        }
      }
      if (event.result.outcome === 'WRONG_PHASE') {
        return {
          ...state,
          submission: 'idle',
          error: 'The round already moved on before your submission arrived.',
        }
      }
      return { ...state, submission: 'idle', error: 'Program rejected. Adjust your selection and try again.' }
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
