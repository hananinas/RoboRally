import { effects } from '@robo-rally/game-events'
import type {
  Card,
  EnvironmentStepResolved,
  Orientation,
  PlayerId,
  PublicRegisters,
  RebootEffect,
  Position,
  RobotSpriteId,
  RobotActionResolved,
} from '@robo-rally/game-events'
import { useCallback, useEffect, useReducer } from 'react'
import type { BoardRenderModel } from './boardModel.ts'

export type { Orientation }
export type RobotPosition = Position
export type Robot = Readonly<{
  robotId: string
  robotSpriteId: RobotSpriteId
  colour: string
  position: RobotPosition
  playerId?: PlayerId
}>
export type ResolvedRobotAction = RobotActionResolved & Readonly<{
  // Program snapshot captured locally when this action is queued.
  program?: readonly (Card | null)[]
  publicRegisters?: ReadonlyMap<PlayerId, PublicRegisters>
}>
export type PlaybackResult = ResolvedRobotAction | EnvironmentStepResolved

type PlacedRobot = Readonly<{ robotId: string; position: Position }>
// Robots in the same phase animate together; waiting robots stand still.
export type PlaybackPhase = Readonly<{
  kind: string
  durationMs: number
  robots: readonly PlacedRobot[]
  waiting: readonly PlacedRobot[]
}>
export type DisplayRobot = Robot & Readonly<{ angle: number; phase?: string }>
export type PlaybackAction = Readonly<{
  action: PlaybackResult
  phases: readonly PlaybackPhase[]
}>

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300
export const PIT_FALL_DURATION_MS = 450
export const PIT_RESPAWN_DURATION_MS = 900
export function robotActionDuration(action: PlaybackResult, reducedMotion: boolean): number {
  if (reducedMotion) return 200
  if ('kind' in action) return action.kind === 'CONVEYORS' ? ROBOT_MOVE_DURATION_MS : ROBOT_TURN_DURATION_MS
  return action.resolvedInstruction !== null && effects[action.resolvedInstruction].kind === 'turn'
    ? ROBOT_TURN_DURATION_MS : ROBOT_MOVE_DURATION_MS
}

export type RobotPlaybackState = Readonly<{
  robots: readonly DisplayRobot[]
  pending: readonly PlaybackAction[]
  active: PlaybackResult | null
  // The active action's phases still to play; the first is showing.
  phases: readonly PlaybackPhase[]
  checkpoints: ReadonlyMap<PlayerId, number>
}>

export type RobotPlaybackEvent =
  | Readonly<{ type: 'enqueue'; action: PlaybackResult; board?: BoardRenderModel | null }>
  | Readonly<{ type: 'advance' }>
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'finish' }>
  | Readonly<{ type: 'reset'; robots: readonly Robot[] }>
  | Readonly<{ type: 'remove'; robotId: string }>

export const orientationAngle: Record<Orientation, number> = {
  NORTH: 0,
  EAST: 90,
  SOUTH: 180,
  WEST: -90,
}

function pitPhases(
  inPit: readonly PlacedRobot[],
  landed: readonly PlacedRobot[],
  waiting: readonly PlacedRobot[] = [],
): readonly PlaybackPhase[] {
  return [
    { kind: 'pit-enter', durationMs: ROBOT_MOVE_DURATION_MS, robots: inPit, waiting },
    { kind: 'pit-fall', durationMs: PIT_FALL_DURATION_MS, robots: inPit, waiting },
    { kind: 'pit-respawn', durationMs: PIT_RESPAWN_DURATION_MS, robots: landed, waiting },
  ]
}

export function playbackPhases(
  action: { kind?: 'CONVEYORS'; reboots: readonly RebootEffect[] },
  startOf: (robotId: string) => Position | undefined,
): readonly PlaybackPhase[] {
  const arrivals = action.reboots.flatMap(({ robotId, fellAt, landedAt }) => {
    const start = startOf(robotId)
    if (!start) return []
    return [{
      origin: { robotId, position: start },
      inPit: { robotId, position: { ...start, coordinate: fellAt } },
      landed: { robotId, position: { ...start, coordinate: landedAt } },
    }]
  })
  if (action.kind === 'CONVEYORS' && arrivals.length > 0) {
    return pitPhases(arrivals.map(({ inPit }) => inPit), arrivals.map(({ landed }) => landed))
  }
  return arrivals.flatMap(({ inPit, landed }, index) => {
    const waiting = arrivals.slice(index + 1).map(({ origin }) => origin)
      .filter(({ robotId }) => robotId !== inPit.robotId)
    return pitPhases([inPit], [landed], waiting)
  })
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

export function createRobotPlaybackState(
  robots: readonly Robot[],
  progress: readonly { playerId: PlayerId; lastCheckpoint: number }[] = [],
): RobotPlaybackState {
  return {
    robots: robots.map((robot) => ({
      ...robot,
      angle: orientationAngle[robot.position.orientation],
    })),
    pending: [],
    active: null,
    phases: [],
    checkpoints: new Map(progress.map(({ playerId, lastCheckpoint }) => [playerId, lastCheckpoint])),
  }
}

function affectedPosition(action: PlaybackResult, robotId: string): Position | undefined {
  if ('kind' in action) return action.robots?.find((robot) => robot.robotId === robotId)?.position
  return robotId === action.robotId ? action.position
    : action.pushedRobots.find((pushed) => pushed.robotId === robotId)?.position
}

function placeRobot(robot: DisplayRobot, position: Position): DisplayRobot {
  const target = orientationAngle[position.orientation]
  const delta = (((target - robot.angle + 180) % 360 + 360) % 360) - 180
  return { ...robot, position, angle: robot.angle + delta }
}

function clearPhase(robot: DisplayRobot): DisplayRobot {
  return robot.phase === undefined ? robot : { ...robot, phase: undefined }
}

function showPhase(robots: readonly DisplayRobot[], phase: PlaybackPhase): readonly DisplayRobot[] {
  return robots.map((robot) => {
    const moving = phase.robots.find(({ robotId }) => robotId === robot.robotId)
    if (moving) return { ...placeRobot(robot, moving.position), phase: phase.kind }
    const waiting = phase.waiting.find(({ robotId }) => robotId === robot.robotId)
    return waiting ? placeRobot(clearPhase(robot), waiting.position) : clearPhase(robot)
  })
}

function applyAction(
  robots: readonly DisplayRobot[],
  action: PlaybackResult,
  phase?: PlaybackPhase,
): readonly DisplayRobot[] {
  const placed = robots.map(clearPhase).map((robot) => {
    const position = affectedPosition(action, robot.robotId)
    return position === undefined ? robot : placeRobot(robot, position)
  })
  return phase ? showPhase(placed, phase) : placed
}

function startNext(state: RobotPlaybackState): RobotPlaybackState {
  const checkpoints = new Map(state.checkpoints)
  for (const [index, { action, phases }] of state.pending.entries()) {
    if ('kind' in action && action.kind === 'CHECKPOINTS') {
      for (const { playerId, lastCheckpoint } of action.checkpointProgress) {
        if (lastCheckpoint > (checkpoints.get(playerId) ?? 0)) checkpoints.set(playerId, lastCheckpoint)
      }
      continue
    }
    if ('kind' in action && action.robots.length === 0) continue
    return {
      robots: applyAction(state.robots, action, phases[0]),
      pending: state.pending.slice(index + 1),
      active: action,
      phases,
      checkpoints,
    }
  }
  return { ...state, robots: state.robots.map(clearPhase), pending: [], active: null, phases: [], checkpoints }
}

function complete(state: RobotPlaybackState): RobotPlaybackState {
  if (!state.active) return state
  return startNext({ ...state, robots: applyAction(state.robots, state.active) })
}

// Shows the next phase, or completes the action once its phases are exhausted.
function advance(state: RobotPlaybackState): RobotPlaybackState {
  if (!state.active) return state
  const [, next, ...rest] = state.phases
  if (!next) return startNext(state)
  return {
    ...state,
    phases: [next, ...rest],
    robots: showPhase(state.robots, next),
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
      pending: state.pending.filter(({ action }) => 'kind' in action || action.robotId !== event.robotId ||
        action.pushedRobots.some((pushed) => pushed.robotId !== event.robotId)),
    }
    return state.active && !('kind' in state.active) && state.active.robotId === event.robotId &&
      !state.active.pushedRobots.some(({ robotId }) => next.robots.some((robot) => robot.robotId === robotId))
      ? startNext(next) : next
  }
  if (event.type === 'complete') return complete(state)
  if (event.type === 'finish') {
    while (state.active) state = complete(state)
    return state
  }
  if (event.type === 'advance') return advance(state)

  const action = event.action
  const entry: PlaybackAction = {
    action,
    // Without a board on screen (or with reduced motion) the action jumps to its result.
    phases: event.board && 'reboots' in action
      ? playbackPhases(action, (robotId) => settledPosition(state, robotId)) : [],
  }
  const queued = { ...state, pending: [...state.pending, entry] }
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
