import { instructions } from '@robo-rally/game-events'
import type {
  Coordinate,
  Orientation,
  PlayerId,
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
  startPosition: Coordinate
}>
export type ResolvedRobotAction = RobotActionResolved
// Moving onto the pit, sinking into it, then appearing at the reboot position.
export type PitPhase = 'move' | 'fall' | 'respawn'
export type DisplayRobot = Robot & Readonly<{ angle: number; pitPhase?: PitPhase }>
export type PlaybackAction = Readonly<{
  sequence: number
  action: ResolvedRobotAction
  pit: Coordinate | null
}>

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300
export const PIT_FALL_DURATION_MS = 450
export const PIT_RESPAWN_DURATION_MS = 300
export function robotActionDuration(action: ResolvedRobotAction, reducedMotion: boolean): number {
  return reducedMotion ? 200
    : instructions[action.instruction].kind === 'turn' ? ROBOT_TURN_DURATION_MS : ROBOT_MOVE_DURATION_MS
}

export function pitPhaseDuration(phase: PitPhase): number {
  return phase === 'move' ? ROBOT_MOVE_DURATION_MS
    : phase === 'fall' ? PIT_FALL_DURATION_MS : PIT_RESPAWN_DURATION_MS
}

export type RobotPlaybackState = Readonly<{
  robots: readonly DisplayRobot[]
  pending: readonly PlaybackAction[]
  active: ResolvedRobotAction | null
  activeSequence: number | null
  pitPhase: PitPhase | null
  nextSequence: number
}>

export type RobotPlaybackEvent =
  // Without a board the action plays without a pit sequence.
  | Readonly<{ type: 'enqueue'; action: ResolvedRobotAction; board?: BoardRenderModel | null }>
  | Readonly<{ type: 'pit-advance' }>
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'reset'; robots: readonly Robot[] }>
  | Readonly<{ type: 'remove'; robotId: string }>

const orientationAngle: Record<Orientation, number> = {
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
  const instruction = instructions[action.instruction]
  if (instruction.kind !== 'move') return null
  const direction = instruction.steps < 0
    ? oppositeOrientation[start.orientation] : start.orientation
  const cellAt = ({ x, y }: Coordinate) =>
    x >= 0 && x < board.columns && y >= 0 && y < board.rows
      ? board.cells[y * board.columns + x] : undefined
  let current = start.coordinate
  for (let step = 0; step < Math.abs(instruction.steps); step++) {
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

export function createRobotPlaybackState(robots: readonly Robot[]): RobotPlaybackState {
  return {
    robots: robots.map((robot) => ({
      ...robot,
      angle: orientationAngle[robot.position.orientation],
    })),
    pending: [],
    active: null,
    activeSequence: null,
    pitPhase: null,
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

function clearPitPhase(robot: DisplayRobot): DisplayRobot {
  return robot.pitPhase === undefined ? robot : { ...robot, pitPhase: undefined }
}

function applyAction(
  robots: readonly DisplayRobot[],
  { action, pit }: PlaybackAction,
): readonly DisplayRobot[] {
  return robots.map(clearPitPhase).map((robot) => {
    if (pit && robot.robotId === action.robotId) {
      return { ...robot, position: { ...robot.position, coordinate: pit }, pitPhase: 'move' }
    }
    const position = affectedPosition(action, robot.robotId)
    return position === undefined ? robot : placeRobot(robot, position)
  })
}

function startNext(state: RobotPlaybackState): RobotPlaybackState {
  const [next, ...pending] = state.pending
  if (!next) {
    return {
      ...state,
      robots: state.robots.map(clearPitPhase),
      active: null,
      activeSequence: null,
      pitPhase: null,
    }
  }
  return {
    robots: applyAction(state.robots, next),
    pending,
    active: next.action,
    activeSequence: next.sequence,
    pitPhase: next.pit ? 'move' : null,
    nextSequence: state.nextSequence,
  }
}

function advancePit(state: RobotPlaybackState): RobotPlaybackState {
  const active = state.active
  if (!active || state.pitPhase === null || state.pitPhase === 'respawn') return state
  const pitPhase = state.pitPhase === 'move' ? 'fall' : 'respawn'
  return {
    ...state,
    pitPhase,
    robots: state.robots.map((robot) => robot.robotId !== active.robotId ? robot
      : { ...(pitPhase === 'respawn' ? placeRobot(robot, active.position) : robot), pitPhase }),
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
  if (event.type === 'pit-advance') return advancePit(state)

  const start = settledPosition(state, event.action.robotId)
  const entry: PlaybackAction = {
    sequence: state.nextSequence,
    action: event.action,
    pit: event.board && start ? findPitEntry(event.board, start, event.action) : null,
  }
  const queued = { ...state, pending: [...state.pending, entry], nextSequence: state.nextSequence + 1 }
  return state.active ? queued : startNext(queued)
}

export function useRobotPlaybackTimer(
  playback: Pick<RobotPlaybackState, 'active' | 'pitPhase'>,
  dispatch: (event: { type: 'complete' } | { type: 'pit-advance' }) => void,
) {
  const { active, pitPhase } = playback
  useEffect(() => {
    if (!active) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = pitPhase ? pitPhaseDuration(pitPhase) : robotActionDuration(active, reducedMotion)
    const event = pitPhase === 'move' || pitPhase === 'fall' ? 'pit-advance' : 'complete'
    const timer = window.setTimeout(() => dispatch({ type: event }), duration)
    return () => window.clearTimeout(timer)
  }, [active, pitPhase, dispatch])
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
