import { useCallback, useEffect, useReducer } from 'react'

export type Orientation = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'
export type RobotPosition = Readonly<{ x: number; y: number; orientation: Orientation }>
export type Robot = Readonly<{
  robotId: string
  colour: string
  position: RobotPosition
}>
export type ResolvedRobotAction = Readonly<{
  robotId: string
  instruction: 'MOVE_1' | 'TURN_LEFT'
  position: RobotPosition
}>
export type DisplayRobot = Robot & Readonly<{ angle: number }>

export const ROBOT_MOVE_DURATION_MS = 600
export const ROBOT_TURN_DURATION_MS = 300

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

export function useRobotPlayback(initialRobots: readonly Robot[]) {
  const [state, dispatch] = useReducer(
    robotPlaybackReducer,
    initialRobots,
    createRobotPlaybackState,
  )

  useEffect(() => {
    if (!state.active) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reducedMotion
      ? 200
      : state.active.instruction === 'TURN_LEFT'
        ? ROBOT_TURN_DURATION_MS
        : ROBOT_MOVE_DURATION_MS
    const timer = window.setTimeout(() => dispatch({ type: 'complete' }), duration)
    return () => window.clearTimeout(timer)
  }, [state.active])

  const enqueue = useCallback((action: ResolvedRobotAction) => {
    dispatch({ type: 'enqueue', action })
  }, [])
  const reset = useCallback((robots: readonly Robot[]) => {
    dispatch({ type: 'reset', robots })
  }, [])

  return {
    robots: state.robots,
    isPlaying: state.active !== null,
    enqueue,
    reset,
  }
}
