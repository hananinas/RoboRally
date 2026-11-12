import type {
  Card,
  CardsDealt,
  GamePhase,
  GameInitialization,
  GameWon,
  Winner,
  PlayerAssignment,
  PlayerConnectionChanged,
  PlayerCheckpointProgress,
  PlayerId,
  PlayerState,
  PlayerLeft,
  ProgramResult,
  ProgramFinalized,
  ProgrammingTimer,
  ProgramTimerChanged,
  ProgramSubmitted,
  PublicRegisters,
  RegistersChanged,
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
  robotId: string | null
  programSubmitted: boolean
  registers: PublicRegisters
}

// Presentation metadata is client-only, never part of PlayerState on the wire.
export type OpponentPlayer = PlayerState & Readonly<{
  robotId: string
  colour: string
}>

export type ClientGameState = {
  connected: boolean
  assignment: PlayerAssignment | null
  phase: GamePhase | null
  programmingTimer: ProgrammingTimer
  paused: boolean
  players: readonly Player[]
  checkpointCount: number
  board: BoardRenderModel | null
  playback: RobotPlaybackState
  playbackRegisters: ReadonlyMap<PlayerId, PublicRegisters> | null
  hand: readonly ProgramCard[]
  registers: Registers
  registersPast: readonly Registers[]
  registersFuture: readonly Registers[]
  // Copy of the submitted program shown while its actions play back.
  playbackProgram: Registers | null
  handVersion: number
  handReady: boolean
  pendingHand: (CardsDealt & { program?: ProgramFinalized['cards'] }) | null
  // Progress held until the playback action it belongs to has finished.
  deferredProgress: readonly DeferredProgress[]
  submission: 'idle' | 'pending' | 'accepted' | 'uncertain'
  aborted: boolean
  winner: Winner | null
  error: string | null
}

export type DeferredProgress = Readonly<{
  sequence: number
  payload: PlayerCheckpointProgress
}>

export type GameStateEvent =
  | { type: 'joined'; result: GameInitialization }
  | { type: 'player-left'; payload: PlayerLeft }
  | { type: 'player-connection-changed'; payload: PlayerConnectionChanged }
  | { type: 'checkpoint-progress'; payload: PlayerCheckpointProgress }
  | { type: 'registers-changed'; payload: RegistersChanged }
  | { type: 'program-submitted'; payload: ProgramSubmitted }
  | { type: 'disconnected' }
  | { type: 'reconnected' }
  | { type: 'connect-error'; message: string }
  | { type: 'aborted' }
  | { type: 'won'; payload: GameWon }
  | { type: 'dealt'; hand: CardsDealt }
  | { type: 'reset' }
  | { type: 'error'; message: string }
  | { type: 'action'; action: RobotActionResolved; reducedMotion?: boolean }
  | { type: 'advance' }
  | { type: 'complete' }
  | { type: 'place'; cardId: string; registerIndex: number }
  | { type: 'remove'; registerIndex: number }
  | { type: 'move'; fromIndex: number; toIndex: number }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'submit' }
  | { type: 'result'; result: ProgramResult; handVersion: number }
  | { type: 'submission-unknown'; handVersion: number }
  | { type: 'program-finalized'; payload: ProgramFinalized }
  | { type: 'timer-changed'; payload: ProgramTimerChanged }

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
    programmingTimer: { status: 'IDLE' },
    paused: false,
    players: [],
    checkpointCount: 0,
    board: null,
    playback: createRobotPlaybackState([]),
    playbackRegisters: null,
    hand: [],
    registers: emptyRegisters(),
    registersPast: [],
    registersFuture: [],
    playbackProgram: null,
    handVersion: 0,
    handReady: false,
    pendingHand: null,
    deferredProgress: [],
    submission: 'idle',
    aborted: false,
    winner:null,
    error: null,
  }
}

export function canProgram(state: ClientGameState): boolean {
  return state.connected &&
    !state.paused &&
    !state.aborted &&
    state.winner === null &&
    state.assignment !== null &&
    state.phase === 'PROGRAMMING' &&
    state.programmingTimer.status !== 'CLOSED' &&
    state.handReady &&
    state.hand.length > 0 &&
    !state.playback.active &&
    state.submission === 'idle'
}


export function getOtherPlayers(state: ClientGameState): readonly OpponentPlayer[] {
  return state.players.flatMap((player) => {
    const registers = state.playbackRegisters?.get(player.playerId) ?? player.registers
    if (player.playerId === state.assignment?.playerId) return []
    const robot = state.playback.robots.find((candidate) => candidate.robotId === player.robotId)
    return robot ? [{ ...player, registers, robotId: robot.robotId, colour: robot.colour }] : []
  })
}

export function createSubmission(state: ClientGameState): SubmitProgram | null {
  if (!canProgram(state) || state.assignment === null) return null
  const [first, second, third, fourth, fifth] = state.registers
  if (!first || !second || !third || !fourth || !fifth) return null
  return {
    cardIds: [first.id, second.id, third.id, fourth.id, fifth.id],
  }
}

function isHandEligible(state: ClientGameState, hand: CardsDealt): boolean {
  return hand.gameId === state.assignment?.gameId &&
    hand.playerId === state.assignment.playerId
}

function adoptPendingHand(state: ClientGameState): ClientGameState {
  const hand = state.pendingHand
  if (!hand) return state
  return {
    ...state,
    hand: hand.cards,
    handVersion: state.handVersion + 1,
    pendingHand: null,
    registers: hand.program ?? emptyRegisters(),
    registersPast: [],
    registersFuture: [],
  }
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
    ...adoptPendingHand(state),
    handReady: true,
    deferredProgress: [],
    playbackProgram: null,
    submission: hand.program ? 'accepted' : 'idle',
    error: state.connected ? null : state.error,
  }
}

function applyCheckpointProgress(
  state: ClientGameState,
  { gameId, playerId, lastCheckpoint, checkpointCount }: PlayerCheckpointProgress,
): ClientGameState {
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

// The latest action in playback that moves the player's robot.
function playbackSequenceFor(state: ClientGameState, playerId: PlayerId): number | null {
  const robotId = state.playback.robots.find((robot) => robot.playerId === playerId)?.robotId
  if (robotId === undefined) return null
  const moves = (action: RobotActionResolved) => action.robotId === robotId ||
    action.pushedRobots.some((pushed) => pushed.robotId === robotId)
  const pending = state.playback.pending.findLast(({ action }) => moves(action))
  if (pending) return pending.sequence
  return state.playback.active && moves(state.playback.active) ? state.playback.activeSequence : null
}

// Apply progress whose action is no longer active or pending.
function settleProgress(state: ClientGameState): ClientGameState {
  const held = new Set([
    state.playback.activeSequence,
    ...state.playback.pending.map((entry) => entry.sequence),
  ])
  const ready = state.deferredProgress.filter((entry) => !held.has(entry.sequence))
  if (ready.length === 0) return state
  return ready.reduce<ClientGameState>((next, entry) => applyCheckpointProgress(next, entry.payload), {
    ...state,
    deferredProgress: state.deferredProgress.filter((entry) => held.has(entry.sequence)),
  })
}
function updatePlayback(state: ClientGameState, playback: RobotPlaybackState): ClientGameState {
  return {
    ...state,
    playback,
    playbackRegisters: registersForPlayback(state, playback),
    playbackProgram: playback.active?.program ?? state.playbackProgram,
  }
}

function finishPlayback(state: ClientGameState): ClientGameState {
  if (state.playback.active || state.phase !== 'PROGRAMMING') return state
  return activateHand({
    ...state,
    playbackProgram: null,
    registers: state.playbackProgram ? emptyRegisters() : state.registers,
  })
}

// A timer started by another client must make the new hand available immediately.
function finishPreviousRound(state: ClientGameState): ClientGameState {
  if (state.phase !== 'PROGRAMMING' || !state.pendingHand || state.programmingTimer.status !== 'RUNNING') return state
  let playback = state.playback
  while (playback.active) playback = robotPlaybackReducer(playback, { type: 'complete' })
  return finishPlayback(updatePlayback(state, playback))
}

function registersForPlayback(state: ClientGameState, playback: RobotPlaybackState): ReadonlyMap<PlayerId, PublicRegisters> | null {
  return playback.active === state.playback.active
    ? state.playbackRegisters
    : playback.active?.publicRegisters ?? null
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
    case 'player-left': {
      const { gameId, playerId, robotId } = event.payload
      if (gameId !== state.assignment?.gameId ||
        !state.players.some((player) => player.playerId === playerId)) return state
      return finishPlayback(settleProgress(updatePlayback({
        ...state,
        players: state.players.filter((player) => player.playerId !== playerId),
      }, robotPlaybackReducer(state.playback, { type: 'remove', robotId }))))
    }
    case 'checkpoint-progress': {
      const sequence = playbackSequenceFor(state, event.payload.playerId)
      if (sequence === null || event.payload.gameId !== state.assignment?.gameId) {
        return applyCheckpointProgress(state, event.payload)
      }
      return {
        ...state,
        deferredProgress: [...state.deferredProgress, { sequence, payload: event.payload }],
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
        programmingTimer: { status: 'CLOSED' },
        error: 'This game has encountered an error and cannot continue.',
      }
    case 'won':
      if (event.payload.gameId !== state.assignment?.gameId || state.winner !== null) return state
              return {
        ...state,
        winner: { playerId: event.payload.playerId, username: event.payload.username },
        programmingTimer: { status: 'CLOSED' },
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
        registers: result.program,
        playbackProgram: snapshot.phase === 'EXECUTING' ? result.program : null,
        handVersion: result.hand.length > 0 ? 1 : 0,
        // After submitting, the hand is empty until the next round is dealt.
        handReady: snapshot.phase === 'PROGRAMMING' && (result.hand.length > 0 || result.programSubmitted),
        submission: result.programSubmitted ? 'accepted' : 'idle',
        phase: snapshot.phase,
        programmingTimer: snapshot.programmingTimer,
        paused: snapshot.paused,
        aborted: snapshot.aborted,
        winner: snapshot.winner,
        error: snapshot.aborted ? 'This game has encountered an error and cannot continue.' : null,
        checkpointCount: snapshot.checkpointCount,
        players: snapshot.players.map((player) => ({
          playerId: player.playerId, username: player.username, connected: player.connected,
          lastCheckpoint: player.lastCheckpoint,
          robotId: snapshot.robots.find((robot) => robot.playerId === player.playerId)?.robotId ?? null,
          programSubmitted: player.programSubmitted,
          registers: player.registers,
        })),
        playback: createRobotPlaybackState(
          snapshot.robots,
        ),
        board: createBoardRenderModel(
          snapshot.board.width,
          snapshot.board.height,
          {
            antenna: snapshot.antenna,
            hole: snapshot.board.tiles.filter((tile) => tile.type === 'PIT')
              .map((tile) => [tile.position.x, tile.position.y] as const),
            conveyor: snapshot.board.tiles.flatMap((tile) => tile.type === 'CONVEYOR' ? [{
              ...tile.position,
              sprite: tile.sprite,
              direction: tile.direction,
            }] : []),

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
      return finishPreviousRound(activateHand({
        ...state,
        phase: 'PROGRAMMING',
        handReady: false,
        pendingHand: hand,
        players: state.players.map((player) => ({
          ...player,
          programSubmitted: false,
          registers: [{ status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }, { status: 'EMPTY' }],
        })),
      }))
    }
    case 'action': {
      const actionPlayerId = event.action.playerId
      const player = state.players.find((candidate) => candidate.robotId === event.action.robotId)
      // Keep pushes playable even if only a pushed robot is known; reveal only the actor's registers.
      if (event.action.gameId !== state.assignment?.gameId ||
          (player !== undefined && actionPlayerId !== player.playerId) ||
          !Number.isInteger(event.action.registerIndex) || event.action.registerIndex < 0 ||
          event.action.registerIndex >= REGISTER_COUNT ||
          !state.playback.robots.some((robot) => robot.robotId === event.action.robotId ||
            event.action.pushedRobots.some((pushed) => pushed.robotId === robot.robotId))) return state
      const registers: [...PublicRegisters] | null = player ? [...player.registers] : null
      if (registers) registers[event.action.registerIndex] = { status: 'REVEALED', instruction: event.action.instruction }
      const next = adoptPendingHand(state)
      const players = player && registers ? next.players.map((candidate) => candidate.playerId === player.playerId
        ? { ...candidate, registers } : candidate) : next.players
      const action = {
        ...event.action,
        program: next.registers,
        publicRegisters: new Map(players.map((candidate) => [candidate.playerId, candidate.registers])),
      }
      return updatePlayback({
        ...next,
        phase: 'EXECUTING',
        handReady: false,
        pendingHand: null,
        playbackProgram: state.playbackProgram ??
          (state.registers.some((card) => card !== null) ? state.registers : null),
        players,
      }, robotPlaybackReducer(next.playback, {
        type: 'enqueue', action, board: event.reducedMotion ? null : state.board,
      }))
    }
    case 'advance':
    case 'complete':
      return finishPlayback(settleProgress(updatePlayback(
        state,
        robotPlaybackReducer(state.playback, { type: event.type }),
      )))
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
    case 'move': {
      if (!canProgram(state)) return state
      const registers = moveCard(state.registers, event.fromIndex, event.toIndex)
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
    case 'program-finalized': {
      const { gameId, playerId, cards } = event.payload
      if (gameId !== state.assignment?.gameId || playerId !== state.assignment.playerId) return state
      return {
        ...state,
        ...(state.pendingHand ? { pendingHand: { ...state.pendingHand, program: cards } } : { registers: cards }),
        registersPast: [],
        registersFuture: [],
        submission: 'accepted',
        error: null,
      }
    }
    case 'timer-changed':
      if (event.payload.gameId !== state.assignment?.gameId) return state
      return finishPreviousRound({ ...state, programmingTimer: event.payload.timer })
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
export function moveCard(
  registers: Registers,
  fromIndex: number,
  toIndex: number,
): Registers {
  const isRegister = (index: number) =>
    Number.isInteger(index) && index >= 0 && index < registers.length
  const cannotMove =
    !isRegister(fromIndex) ||
    !isRegister(toIndex) ||
    fromIndex === toIndex ||
    registers[fromIndex] === null

  if (cannotMove) return registers

  return registers.map((registeredCard, index) => {
    if (index === fromIndex) return registers[toIndex]
    if (index === toIndex) return registers[fromIndex]
    return registeredCard
  })
}

// Checks whether every register is filled.
export function registersAreFilled(registers: Registers): boolean {
  return registers.length === REGISTER_COUNT && registers.every((card) => card !== null)
}
