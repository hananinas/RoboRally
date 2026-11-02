import { instructions } from '@robo-rally/game-events'
import type {
  EnvironmentStepResolved,
  Orientation,
  Position,
  RobotActionResolved,
} from '@robo-rally/game-events'
import { useCallback, useEffect, useReducer } from 'react'

export type { Orientation }
export type RobotPosition = Position
export type Robot = Readonly<{
  robotId: string
  colour: string
  position: RobotPosition
}>
export type ResolvedRobotAction = RobotActionResolved
export type ResolvedPlaybackAction = RobotActionResolved | EnvironmentStepResolved
export type DisplayRobot = Robot & Readonly<{ angle: number }>

export function isEnvironmentStep(action: ResolvedPlaybackAction): action is EnvironmentStepResolved {
  return 'kind' in action
}

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300
export function playbackDuration(action: ResolvedPlaybackAction, reducedMotion: boolean): number {
  if (isEnvironmentStep(action) && action.robots.length === 0) return 0
  if (reducedMotion) return 200
  if (isEnvironmentStep(action)) return ROBOT_MOVE_DURATION_MS
  return instructions[action.instruction].kind === 'turn' ? ROBOT_TURN_DURATION_MS : ROBOT_MOVE_DURATION_MS
}

export type RobotPlaybackState = Readonly<{
  robots: readonly DisplayRobot[]
  pending: readonly ResolvedPlaybackAction[]
  active: ResolvedPlaybackAction | null
}>

export type RobotPlaybackEvent =
  | Readonly<{ type: 'enqueue'; action: ResolvedPlaybackAction }>
  | Readonly<{ type: 'complete'; action?: ResolvedPlaybackAction }>
  | Readonly<{ type: 'reset'; robots: readonly Robot[] }>
  | Readonly<{ type: 'remove'; robotId: string }>

const orientationAngle: Record<Orientation, number> = {
  NORTH: 0,
  EAST: 90,
  SOUTH: 180,
  WEST: -90,
}

export function createRobotPlaybackState(robots: readonly Robot[]): RobotPlaybackState {
  return {
    robots: robots.map((robot) => ({
      ...robot,
      angle: orientationAngle[robot.position.orientation],
    })),
    pending: [],
    active: null,
  }
}

function applyAction(
  robots: readonly DisplayRobot[],
  action: ResolvedPlaybackAction,
): readonly DisplayRobot[] {
  const changes = isEnvironmentStep(action) ? action.robots
    : [{ robotId: action.robotId, position: action.position }, ...action.pushedRobots]
  return robots.map((robot) => {
    const position = changes.find((change) => change.robotId === robot.robotId)?.position
    if (position === undefined) return robot
    const target = orientationAngle[position.orientation]
    const delta = ((target - robot.angle) % 360 + 540) % 360 - 180
    return {
      ...robot,
      position,
      angle: robot.angle + delta,
    }
  })
}

function startNext(state: RobotPlaybackState): RobotPlaybackState {
  const [next, ...pending] = state.pending
  if (!next) return { ...state, active: null }
  return {
    robots: applyAction(state.robots, next),
    pending,
    active: next,
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
      pending: state.pending.filter((action) => isEnvironmentStep(action) || action.robotId !== event.robotId ||
        action.pushedRobots.some((pushed) => pushed.robotId !== event.robotId)),
    }
    return state.active && !isEnvironmentStep(state.active) && state.active.robotId === event.robotId
      ? startNext(next) : next
  }
  if (event.type === 'complete') {
    return event.action && event.action !== state.active ? state : startNext(state)
  }

  const queued = { ...state, pending: [...state.pending, event.action] }
  return state.active ? queued : startNext(queued)
}

export function usePlaybackTimer(
  active: ResolvedPlaybackAction | null,
  dispatch: (event: { type: 'complete'; action: ResolvedPlaybackAction }) => void,
) {
  useEffect(() => {
    if (!active) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = playbackDuration(active, reducedMotion)
    const timer = window.setTimeout(() => dispatch({ type: 'complete', action: active }), duration)
    return () => window.clearTimeout(timer)
  }, [active, dispatch])
}

export function useRobotPlayback(initialRobots: readonly Robot[]) {
  const [state, dispatch] = useReducer(
    robotPlaybackReducer,
    initialRobots,
    createRobotPlaybackState,
  )
  usePlaybackTimer(state.active, dispatch)

  const enqueue = useCallback((action: ResolvedPlaybackAction) => {
    dispatch({ type: 'enqueue', action })
  }, [])

  return {
    robots: state.robots,
    enqueue,
  }
}
