import { describe, expect, it } from 'vitest'
import { DEMO_ROBOTS } from './demoBoard.ts'
import {
  createRobotPlaybackState,
  robotActionDuration,
  robotPlaybackReducer,
  type ResolvedRobotAction,
} from './robotPlayback.ts'

const steps: readonly ResolvedRobotAction[] = [
  { gameId: 'demo', registerIndex: 0, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 6 }, orientation: 'NORTH' } },
  { gameId: 'demo', registerIndex: 1, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 5 }, orientation: 'NORTH' } },
  { gameId: 'demo', registerIndex: 2, robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 10, y: 5 }, orientation: 'WEST' } },
  { gameId: 'demo', registerIndex: 3, robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 9, y: 5 }, orientation: 'WEST' } },
  { gameId: 'demo', registerIndex: 4, robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 9, y: 5 }, orientation: 'SOUTH' } },
]

describe('robot playback', () => {
  it('shows every received register result in order', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    for (const action of steps) {
      state = robotPlaybackReducer(state, { type: 'enqueue', action })
    }

    expect(state.active).toEqual(steps[0])
    expect(state.pending).toEqual(steps.slice(1))
    for (const [index, step] of steps.entries()) {
      expect(state.robots.find((robot) => robot.robotId === 'red')?.position)
        .toEqual(step.position)
      expect(state.robots.find((robot) => robot.robotId === 'blue')?.position)
        .toEqual(DEMO_ROBOTS[0].position)
      state = robotPlaybackReducer(state, { type: 'complete' })
      expect(state.active).toEqual(steps[index + 1] ?? null)
    }
    expect(state.pending).toEqual([])
    expect(state.robots.find((robot) => robot.robotId === 'red')?.angle).toBe(-180)
  })

  it('plays different robots sharing a register without collapsing either action', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    const blue = { ...steps[0], robotId: 'blue', position: { coordinate: { x: 8, y: 7 }, orientation: 'WEST' as const } }
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[0] })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: blue })
    expect(state.robots[0].position).toEqual(DEMO_ROBOTS[0].position)
    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toEqual(blue)
    expect(state.robots.find((robot) => robot.robotId === 'red')?.position).toEqual(steps[0].position)
    expect(state.robots.find((robot) => robot.robotId === 'blue')?.position).toEqual(blue.position)
    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toBeNull()
  })

  it('uses the server position and clears pending steps on a new snapshot', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, {
      type: 'enqueue',
      action: { ...steps[0], position: { coordinate: { x: 2, y: 3 }, orientation: 'NORTH' } },
    })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[1] })
    expect(state.robots.find((robot) => robot.robotId === 'red')?.position)
      .toEqual({ coordinate: { x: 2, y: 3 }, orientation: 'NORTH' })

    state = robotPlaybackReducer(state, { type: 'reset', robots: DEMO_ROBOTS })
    expect(state).toEqual(createRobotPlaybackState(DEMO_ROBOTS))
  })
})


describe('robot action timing', () => {
  it.each([
    ['MOVE_1', 600], ['MOVE_2', 600], ['MOVE_3', 600], ['BACK_UP', 600],
    ['TURN_LEFT', 300], ['TURN_RIGHT', 300], ['U_TURN', 300],
  ] as const)('times %s and respects reduced motion', (instruction, duration) => {
    const action = { ...steps[0], instruction }
    expect(robotActionDuration(action, false)).toBe(duration)
    expect(robotActionDuration(action, true)).toBe(200)
  })
})
