import { describe, expect, it } from 'vitest'
import { DEMO_ROBOTS } from './demoBoard.ts'
import {
  createRobotPlaybackState,
  robotPlaybackReducer,
  type ResolvedRobotAction,
} from './robotPlayback.ts'

const steps: readonly ResolvedRobotAction[] = [
  { robotId: 'red', instruction: 'MOVE_1', position: { x: 10, y: 6, orientation: 'NORTH' } },
  { robotId: 'red', instruction: 'MOVE_1', position: { x: 10, y: 5, orientation: 'NORTH' } },
  { robotId: 'red', instruction: 'TURN_LEFT', position: { x: 10, y: 5, orientation: 'WEST' } },
  { robotId: 'red', instruction: 'MOVE_1', position: { x: 9, y: 5, orientation: 'WEST' } },
  { robotId: 'red', instruction: 'TURN_LEFT', position: { x: 9, y: 5, orientation: 'SOUTH' } },
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

  it('uses the server position and clears pending steps on a new snapshot', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, {
      type: 'enqueue',
      action: { robotId: 'red', instruction: 'MOVE_1', position: { x: 2, y: 3, orientation: 'NORTH' } },
    })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[1] })
    expect(state.robots.find((robot) => robot.robotId === 'red')?.position)
      .toEqual({ x: 2, y: 3, orientation: 'NORTH' })

    state = robotPlaybackReducer(state, { type: 'reset', robots: DEMO_ROBOTS })
    expect(state).toEqual(createRobotPlaybackState(DEMO_ROBOTS))
  })
})
