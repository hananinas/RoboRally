import { effects } from '@robo-rally/game-events'
import type {
  Card,
  Coordinate,
  Orientation,
  PlayerId,
  PublicRegisters,
  Position,
  RobotActionResolved,
} from '@robo-rally/game-events'
import { useCallback, useEffect, useReducer } from 'react'
import type { BoardRenderModel, BoardWallSide } from './boardModel.ts'

export type { Orientation }
export type RobotPosition = Position
export type Robot = Readonly<{
  robotId: string
  colour: string
  position: RobotPosition
  playerId?: PlayerId
}>
export type ResolvedRobotAction = RobotActionResolved & Readonly<{
  // Program snapshot captured locally when this action is queued.
  program?: readonly (Card | null)[]
  publicRegisters?: ReadonlyMap<PlayerId, PublicRegisters>
}>
// A step the acting robot shows before its action completes. Producers own the kinds.
export type PlaybackPhase = Readonly<{ kind: string; durationMs: number; position: Position }>
export type DisplayRobot = Robot & Readonly<{ angle: number; phase?: string }>
export type PlaybackAction = Readonly<{
  sequence: number
  action: ResolvedRobotAction
  phases: readonly PlaybackPhase[]
}>

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300
export const PIT_FALL_DURATION_MS = 450
export const PIT_RESPAWN_DURATION_MS = 300
export function robotActionDuration(action: ResolvedRobotAction, reducedMotion: boolean): number {
  return reducedMotion ? 200
    : action.resolvedInstruction !== null && effects[action.resolvedInstruction].kind === 'turn'
      ? ROBOT_TURN_DURATION_MS : ROBOT_MOVE_DURATION_MS
}

export type RobotPlaybackState = Readonly<{
  robots: readonly DisplayRobot[]
  pending: readonly PlaybackAction[]
  active: ResolvedRobotAction | null
  activeSequence: number | null
  // The active action's phases still to play; the first is showing.
  phases: readonly PlaybackPhase[]
  nextSequence: number
}>

export type RobotPlaybackEvent =
  // Without a board the action plays without phases.
  | Readonly<{ type: 'enqueue'; action: ResolvedRobotAction; board?: BoardRenderModel | null }>
  | Readonly<{ type: 'advance' }>
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'reset'; robots: readonly Robot[] }>
  | Readonly<{ type: 'remove'; robotId: string }>

export const orientationAngle: Record<Orientation, number> = {
  NORTH: 0,
  EAST: 90,
  SOUTH: 180,
  WEST: -90,
}

const stepOffset: Record<Orientation, Coordinate> = {
  NORTH: { x: 0, y: -1 },
  EAST: { x: 1, y: 0 },
  SOUTH: { x: 0, y: 1 },
  WEST: { x: -1, y: 0 },
}

const oppositeOrientation: Record<Orientation, Orientation> = {
  NORTH: 'SOUTH',
  EAST: 'WEST',
  SOUTH: 'NORTH',
  WEST: 'EAST',
}

const wallSide: Record<Orientation, BoardWallSide> = {
  NORTH: 'north',
  EAST: 'east',
  SOUTH: 'south',
  WEST: 'west',
}

// The first hole on the movement path before the resolved position, if any.
export function findPitEntry(
  board: BoardRenderModel,
  start: Position,
  action: ResolvedRobotAction,
): Coordinate | null {
  const effect = action.resolvedInstruction === null
    ? null : effects[action.resolvedInstruction]
  if (!effect || effect.kind !== 'move') return null
  const direction = effect.steps < 0
    ? oppositeOrientation[start.orientation] : start.orientation
  const cellAt = ({ x, y }: Coordinate) =>
    x >= 0 && x < board.columns && y >= 0 && y < board.rows
      ? board.cells[y * board.columns + x] : undefined
  let current = start.coordinate
  for (let step = 0; step < Math.abs(effect.steps); step++) {
    const next = { x: current.x + stepOffset[direction].x, y: current.y + stepOffset[direction].y }
    const nextCell = cellAt(next)
    if (!nextCell || cellAt(current)?.walls[wallSide[direction]] ||
      nextCell.walls[wallSide[oppositeOrientation[direction]]] ||
      (board.antenna?.x === next.x && board.antenna.y === next.y)) return null
    if (next.x === action.position.coordinate.x && next.y === action.position.coordinate.y) return null
    if (nextCell.tile === 'hole') return next
    current = next
  }
  return null
}

// Moving onto the pit, sinking into it, then appearing at the reboot position.
function pitPhases(
  action: ResolvedRobotAction,
  board: BoardRenderModel,
  start: Position,
): readonly PlaybackPhase[] {
  const pit = findPitEntry(board, start, action)
  if (!pit) return []
  const inPit = { ...start, coordinate: pit }
  return [
    { kind: 'pit-enter', durationMs: ROBOT_MOVE_DURATION_MS, position: inPit },
    { kind: 'pit-fall', durationMs: PIT_FALL_DURATION_MS, position: inPit },
    { kind: 'pit-respawn', durationMs: PIT_RESPAWN_DURATION_MS, position: action.position },
  ]
}

// Each effect (pit, laser, board edge) contributes its phases here.
export function playbackPhases(
  action: ResolvedRobotAction,
  board: BoardRenderModel,
  start: Position,
): readonly PlaybackPhase[] {
  return pitPhases(action, board, start)
}

export function createRobotPlaybackState(robots: readonly Robot[]): RobotPlaybackState {
  return {
    robots: robots.map((robot) => ({
      ...robot,
      angle: orientationAngle[robot.position.orientation],
    })),
    pending: [],
    active: null,
    activeSequence: null,
    phases: [],
    nextSequence: 0,
  }
}

function affectedPosition(action: ResolvedRobotAction, robotId: string): Position | undefined {
  return robotId === action.robotId ? action.position
    : action.pushedRobots.find((pushed) => pushed.robotId === robotId)?.position
}

// Where the robot stands once every action already in playback has finished.
function settledPosition(state: RobotPlaybackState, robotId: string): Position | undefined {
  for (const { action } of [...state.pending].reverse()) {
    const position = affectedPosition(action, robotId)
    if (position) return position
  }
  return (state.active && affectedPosition(state.active, robotId)) ??
    state.robots.find((robot) => robot.robotId === robotId)?.position
}

function placeRobot(robot: DisplayRobot, position: Position): DisplayRobot {
  const target = orientationAngle[position.orientation]
  const delta = ((target - robot.angle + 540) % 360) - 180
  return { ...robot, position, angle: robot.angle + delta }
}

function clearPhase(robot: DisplayRobot): DisplayRobot {
  return robot.phase === undefined ? robot : { ...robot, phase: undefined }
}

function showPhase(
  robots: readonly DisplayRobot[],
  robotId: string,
  phase: PlaybackPhase,
): readonly DisplayRobot[] {
  return robots.map((robot) => robot.robotId !== robotId ? robot
    : { ...placeRobot(robot, phase.position), phase: phase.kind })
}

function applyAction(
  robots: readonly DisplayRobot[],
  { action, phases: [phase] }: PlaybackAction,
): readonly DisplayRobot[] {
  const placed = robots.map(clearPhase).map((robot) => {
    const position = affectedPosition(action, robot.robotId)
    return position === undefined ? robot : placeRobot(robot, position)
  })
  return phase ? showPhase(placed, action.robotId, phase) : placed
}

function startNext(state: RobotPlaybackState): RobotPlaybackState {
  const [next, ...pending] = state.pending
  if (!next) {
    return {
      ...state,
      robots: state.robots.map(clearPhase),
      active: null,
      activeSequence: null,
      phases: [],
    }
  }
  return {
    robots: applyAction(state.robots, next),
    pending,
    active: next.action,
    activeSequence: next.sequence,
    phases: next.phases,
    nextSequence: state.nextSequence,
  }
}

// Shows the next phase, or completes the action once its phases are exhausted.
function advance(state: RobotPlaybackState): RobotPlaybackState {
  if (!state.active) return state
  const [, next, ...rest] = state.phases
  if (!next) return startNext(state)
  return {
    ...state,
    phases: [next, ...rest],
    robots: showPhase(state.robots, state.active.robotId, next),
  }
}

export function robotPlaybackReducer(
  state: RobotPlaybackState,
  event: RobotPlaybackEvent,
): RobotPlaybackState {
  if (event.type === 'reset') return createRobotPlaybackState(event.robots)
  if (event.type === 'remove') {
    const next = {
      ...state,
      robots: state.robots.filter((robot) => robot.robotId !== event.robotId),
      pending: state.pending.filter(({ action }) => action.robotId !== event.robotId ||
        action.pushedRobots.some((pushed) => pushed.robotId !== event.robotId)),
    }
    return state.active?.robotId === event.robotId ? startNext(next) : next
  }
  if (event.type === 'complete') return startNext(state)
  if (event.type === 'advance') return advance(state)

  const start = settledPosition(state, event.action.robotId)
  const entry: PlaybackAction = {
    sequence: state.nextSequence,
    action: event.action,
    phases: event.board && start ? playbackPhases(event.action, event.board, start) : [],
  }
  const queued = { ...state, pending: [...state.pending, entry], nextSequence: state.nextSequence + 1 }
  return state.active ? queued : startNext(queued)
}

export function useRobotPlaybackTimer(
  playback: Pick<RobotPlaybackState, 'active' | 'phases'>,
  dispatch: (event: { type: 'advance' }) => void,
) {
  const { active, phases: [phase] } = playback
  useEffect(() => {
    if (!active) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = phase ? phase.durationMs : robotActionDuration(active, reducedMotion)
    const timer = window.setTimeout(() => dispatch({ type: 'advance' }), duration)
    return () => window.clearTimeout(timer)
  }, [active, phase, dispatch])
}

export function useRobotPlayback(initialRobots: readonly Robot[]) {
  const [state, dispatch] = useReducer(
    robotPlaybackReducer,
    initialRobots,
    createRobotPlaybackState,
  )
  useRobotPlaybackTimer(state, dispatch)

  const enqueue = useCallback((action: ResolvedRobotAction) => {
    dispatch({ type: 'enqueue', action })
  }, [])

  return {
    robots: state.robots,
    enqueue,
  }
}
