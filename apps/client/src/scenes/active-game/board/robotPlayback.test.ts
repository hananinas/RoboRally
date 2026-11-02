import type { EnvironmentStepResolved, Orientation } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { DEMO_ROBOTS } from './demoBoard.ts'
import {
  createRobotPlaybackState,
  playbackDuration,
  robotPlaybackReducer,
  type ResolvedRobotAction,
} from './robotPlayback.ts'

const steps: readonly ResolvedRobotAction[] = [
  { gameId: 'demo', registerIndex: 0, pushedRobots: [], robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 6 }, orientation: 'NORTH' } },
  { gameId: 'demo', registerIndex: 1, pushedRobots: [], robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 10, y: 5 }, orientation: 'NORTH' } },
  { gameId: 'demo', registerIndex: 2, pushedRobots: [], robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 10, y: 5 }, orientation: 'WEST' } },
  { gameId: 'demo', registerIndex: 3, pushedRobots: [], robotId: 'red', instruction: 'MOVE_1', position: { coordinate: { x: 9, y: 5 }, orientation: 'WEST' } },
  { gameId: 'demo', registerIndex: 4, pushedRobots: [], robotId: 'red', instruction: 'TURN_LEFT', position: { coordinate: { x: 9, y: 5 }, orientation: 'SOUTH' } },
]

describe('robot playback', () => {
  const push: ResolvedRobotAction = {
    ...steps[0],
    position: { coordinate: { x: 10, y: 7 }, orientation: 'NORTH' },
    pushedRobots: [
      { robotId: 'blue', position: { coordinate: { x: 9, y: 6 }, orientation: 'WEST' } },
      { robotId: 'green', position: { coordinate: { x: 11, y: 6 }, orientation: 'SOUTH' } },
    ],
  }

  it('applies every pushed position together when its queued action starts', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[0] })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: push })
    expect(state.robots[0].position).toEqual(DEMO_ROBOTS[0].position)
    expect(state.robots[2].position).toEqual(DEMO_ROBOTS[2].position)

    state = robotPlaybackReducer(state, { type: 'complete' })

    expect(state.active).toBe(push)
    expect(state.robots.map((robot) => robot.position)).toEqual([
      push.pushedRobots[0].position, push.position, push.pushedRobots[1].position,
    ])
    expect(state.robots.map((robot) => robot.angle)).toEqual([-90, 0, 180])
    expect(state.pending).toEqual([])
  })

  it('keeps queued pushes to surviving robots when the acting robot leaves', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[0] })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: push })
    state = robotPlaybackReducer(state, { type: 'remove', robotId: 'red' })

    expect(state.active).toBe(push)
    expect(state.robots.map((robot) => robot.robotId)).toEqual(['blue', 'green'])
    expect(state.robots.map((robot) => robot.position)).toEqual(push.pushedRobots.map((robot) => robot.position))
  })

  it('does not recreate a departed robot when a queued push starts', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[0] })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: push })
    state = robotPlaybackReducer(state, { type: 'remove', robotId: 'blue' })
    state = robotPlaybackReducer(state, { type: 'complete' })

    expect(state.robots.map((robot) => robot.robotId)).toEqual(['red', 'green'])
    expect(state.robots[1].position).toEqual(push.pushedRobots[1].position)
  })

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
    expect(playbackDuration(action, false)).toBe(duration)
    expect(playbackDuration(action, true)).toBe(200)
  })
})

describe('environment playback', () => {
  it('keeps repeated gear rotations at 90 degrees in both directions', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS.map((robot) => ({
      ...robot, position: { ...robot.position, orientation: 'NORTH' },
    })))
    const clockwise: readonly Orientation[] = ['EAST', 'SOUTH', 'WEST', 'NORTH']
    const counterclockwise: readonly Orientation[] = ['WEST', 'SOUTH', 'EAST', 'NORTH']
    for (let index = 0; index < 12; index++) {
      const action: EnvironmentStepResolved = {
        gameId: 'demo', roundNumber: Math.floor(index / 5) + 1, registerIndex: index % 5,
        stepIndex: 0, kind: 'GEARS', sequence: index * 2 + 1, checkpointProgress: [],
        robots: [
          { robotId: 'red', position: { coordinate: DEMO_ROBOTS[1].position.coordinate, orientation: counterclockwise[index % 4] } },
          { robotId: 'blue', position: { coordinate: DEMO_ROBOTS[0].position.coordinate, orientation: clockwise[index % 4] } },
        ],
      }
      state = robotPlaybackReducer(state, { type: 'enqueue', action })
      expect(state.robots.find(({ robotId }) => robotId === 'red')?.angle).toBe(-(index + 1) * 90)
      expect(state.robots.find(({ robotId }) => robotId === 'blue')?.angle).toBe((index + 1) * 90)
      expect(state.robots.map(({ position }) => position.coordinate)).toEqual(DEMO_ROBOTS.map(({ position }) => position.coordinate))
      expect(state.robots[2].angle).toBe(0)
      state = robotPlaybackReducer(state, { type: 'complete', action })
    }
  })

  const environment: EnvironmentStepResolved = {
    gameId: 'demo', roundNumber: 1, registerIndex: 0, stepIndex: 0,
    kind: 'CHECKPOINTS', sequence: 1,
    robots: [
      { robotId: 'red', position: { coordinate: { x: 8, y: 6 }, orientation: 'WEST' } },
      { robotId: 'blue', position: { coordinate: { x: 9, y: 6 }, orientation: 'EAST' } },
    ],
    checkpointProgress: [],
  }

  it('plays a simultaneous environment result between robot actions', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    for (const action of [steps[0], environment, steps[1]]) {
      state = robotPlaybackReducer(state, { type: 'enqueue', action })
    }
    expect(state.active).toBe(steps[0])
    expect(state.robots.find((robot) => robot.robotId === 'blue')?.position).toEqual(DEMO_ROBOTS[0].position)

    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toBe(environment)
    for (const change of environment.robots) {
      expect(state.robots.find((robot) => robot.robotId === change.robotId)?.position).toEqual(change.position)
    }
    expect(playbackDuration(environment, false)).toBe(600)
    expect(playbackDuration(environment, true)).toBe(200)

    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toBe(steps[1])
    expect(state.robots.find((robot) => robot.robotId === 'red')?.position).toEqual(steps[1].position)
  })

  it('keeps environment results when robots leave and ignores their old timers', () => {
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: steps[0] })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: environment })
    state = robotPlaybackReducer(state, { type: 'remove', robotId: 'red' })
    expect(state.active).toBe(environment)
    expect(state.robots.some((robot) => robot.robotId === 'red')).toBe(false)
    expect(state.robots.find((robot) => robot.robotId === 'blue')?.position).toEqual(environment.robots[1].position)
    expect(robotPlaybackReducer(state, { type: 'complete', action: steps[0] })).toBe(state)
  })

  it('preserves empty environment steps without adding an animation delay', () => {
    const empty = { ...environment, robots: [] }
    let state = createRobotPlaybackState(DEMO_ROBOTS)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: empty })
    expect(state.active).toBe(empty)
    expect(playbackDuration(empty, false)).toBe(0)
    expect(playbackDuration(empty, true)).toBe(0)
    state = robotPlaybackReducer(state, { type: 'remove', robotId: 'red' })
    expect(state.active).toBe(empty)
    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toBeNull()
  })
})
