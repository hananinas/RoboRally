import type {
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
export type DisplayRobot = Robot & Readonly<{ angle: number }>

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300

export function robotActionDuration(action: ResolvedRobotAction, reducedMotion: boolean): number {
  return reducedMotion ? 200
    : action.instruction === 'TURN_LEFT' ? ROBOT_TURN_DURATION_MS : ROBOT_MOVE_DURATION_MS
}

export type RobotPlaybackState = Readonly<{
  robots: readonly DisplayRobot[]
  pending: readonly ResolvedRobotAction[]
  active: ResolvedRobotAction | null
}>

export type RobotPlaybackEvent =
  | Readonly<{ type: 'enqueue'; action: ResolvedRobotAction }>
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'reset'; robots: readonly Robot[] }>

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
  action: ResolvedRobotAction,
): readonly DisplayRobot[] {
  return robots.map((robot) => {
    if (robot.robotId !== action.robotId) return robot
    const target = orientationAngle[action.position.orientation]
    const delta = ((target - robot.angle + 540) % 360) - 180
    return {
      ...robot,
      position: action.position,
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
  if (event.type === 'complete') return startNext(state)

  const queued = { ...state, pending: [...state.pending, event.action] }
  return state.active ? queued : startNext(queued)
}

export function useRobotPlaybackTimer(
  active: ResolvedRobotAction | null,
  dispatch: (event: { type: 'complete' }) => void,
) {
  useEffect(() => {
    if (!active) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = robotActionDuration(active, reducedMotion)
    const timer = window.setTimeout(() => dispatch({ type: 'complete' }), duration)
    return () => window.clearTimeout(timer)
  }, [active, dispatch])
}

export function useRobotPlayback(initialRobots: readonly Robot[]) {
  const [state, dispatch] = useReducer(
    robotPlaybackReducer,
    initialRobots,
    createRobotPlaybackState,
  )
  useRobotPlaybackTimer(state.active, dispatch)

  const enqueue = useCallback((action: ResolvedRobotAction) => {
    dispatch({ type: 'enqueue', action })
  }, [])

  return {
    robots: state.robots,
    enqueue,
  }
}
