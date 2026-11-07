import { describe, expect, it } from 'vitest'
import { createBoardRenderModel } from './boardModel.ts'
import { DEMO_ROBOTS } from './demoBoard.ts'
import {
  createRobotPlaybackState,
  findPitEntry,
  PIT_FALL_DURATION_MS,
  PIT_RESPAWN_DURATION_MS,
  pitPhaseDuration,
  ROBOT_MOVE_DURATION_MS,
  robotActionDuration,
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
    expect(state.pending.map((entry) => entry.action)).toEqual(steps.slice(1))
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

describe('pit entry', () => {
  const board = createBoardRenderModel(5, 5, { hole: [[2, 1], [2, 4]] })
  const start = { coordinate: { x: 2, y: 3 }, orientation: 'NORTH' as const }
  const reboot = { coordinate: { x: 0, y: 0 }, orientation: 'NORTH' as const }
  const move = (
    instruction: ResolvedRobotAction['instruction'],
    position: ResolvedRobotAction['position'] = reboot,
  ): ResolvedRobotAction => ({
    gameId: 'demo', registerIndex: 0, pushedRobots: [], robotId: 'red', instruction, position,
  })

  it('finds the hole reached by a straight move', () => {
    expect(findPitEntry(board, start, move('MOVE_2'))).toEqual({ x: 2, y: 1 })
    expect(findPitEntry(board, start, move('MOVE_3'))).toEqual({ x: 2, y: 1 })
  })

  it('follows the reverse direction when backing up', () => {
    expect(findPitEntry(board, start, move('BACK_UP'))).toEqual({ x: 2, y: 4 })
  })

  it('stops at a wall on either side of the crossed edge', () => {
    const stopped = { coordinate: { x: 2, y: 2 }, orientation: 'NORTH' as const }
    for (const walls of [{ x: 2, y: 2, north: true }, { x: 2, y: 1, south: true }]) {
      const walled = createBoardRenderModel(5, 5, { hole: [[2, 1]], walls: [walls] })
      expect(findPitEntry(walled, start, move('MOVE_2', stopped))).toBeNull()
      expect(findPitEntry(walled, start, move('MOVE_2'))).toBeNull()
    }
  })

  it('finds no pit without a hole on the path', () => {
    expect(findPitEntry(board, start, move('MOVE_1', { ...start, coordinate: { x: 2, y: 2 } }))).toBeNull()
    expect(findPitEntry(board, { ...start, orientation: 'EAST' }, move('MOVE_2'))).toBeNull()
  })

  it('never finds a pit for a turn', () => {
    for (const instruction of ['TURN_LEFT', 'TURN_RIGHT', 'U_TURN'] as const) {
      expect(findPitEntry(board, start, move(instruction))).toBeNull()
    }
  })

  it('finds no pit when the robot stops before the hole or the hole is the final position', () => {
    expect(findPitEntry(board, start, move('MOVE_2', { ...start, coordinate: { x: 2, y: 2 } }))).toBeNull()
    expect(findPitEntry(board, start, move('MOVE_2', { ...start, coordinate: { x: 2, y: 1 } }))).toBeNull()
  })

  it('plays the move, fall and respawn before the action completes', () => {
    const robots = [{ robotId: 'red', colour: '#E55F5F', position: start }, DEMO_ROBOTS[0]]
    const action = { ...move('MOVE_2', { coordinate: { x: 0, y: 0 }, orientation: 'EAST' }),
      pushedRobots: [{ robotId: 'blue', position: { coordinate: { x: 2, y: 0 }, orientation: 'WEST' as const } }] }
    let state = createRobotPlaybackState(robots)
    state = robotPlaybackReducer(state, { type: 'enqueue', action, board })
    expect(state.active).toBe(action)
    expect(state.activeSequence).toBe(0)
    expect(state.pitPhase).toBe('move')
    expect(state.robots[0]).toMatchObject({ position: { ...start, coordinate: { x: 2, y: 1 } }, pitPhase: 'move' })
    expect(state.robots[1].position).toEqual(action.pushedRobots[0].position)

    state = robotPlaybackReducer(state, { type: 'pit-advance' })
    expect(state.robots[0]).toMatchObject({ position: { coordinate: { x: 2, y: 1 } }, pitPhase: 'fall' })
    state = robotPlaybackReducer(state, { type: 'pit-advance' })
    expect(state.robots[0]).toMatchObject({ position: action.position, angle: 90, pitPhase: 'respawn' })
    expect(robotPlaybackReducer(state, { type: 'pit-advance' })).toBe(state)

    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active).toBeNull()
    expect(state.pitPhase).toBeNull()
    expect(state.robots[0]).toEqual({ ...robots[0], position: action.position, angle: 90 })
  })

  it('derives a queued pit from the position after earlier queued actions', () => {
    const robots = [{ robotId: 'red', colour: '#E55F5F', position: { ...start, coordinate: { x: 2, y: 4 } } }]
    const first = move('TURN_LEFT', { coordinate: { x: 2, y: 4 }, orientation: 'NORTH' })
    let state = createRobotPlaybackState(robots)
    state = robotPlaybackReducer(state, { type: 'enqueue', action: { ...first, instruction: 'MOVE_1', position: start }, board })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: move('MOVE_2'), board })
    expect(state.pending.map((entry) => [entry.sequence, entry.pit])).toEqual([[1, { x: 2, y: 1 }]])
  })

  it('does not stall when completed mid sequence or without a board', () => {
    const robots = [{ robotId: 'red', colour: '#E55F5F', position: start }]
    let state = robotPlaybackReducer(createRobotPlaybackState(robots), { type: 'enqueue', action: move('MOVE_2'), board })
    state = robotPlaybackReducer(state, { type: 'enqueue', action: move('TURN_LEFT'), board })
    state = robotPlaybackReducer(state, { type: 'complete' })
    expect(state.active?.instruction).toBe('TURN_LEFT')
    expect(state.pitPhase).toBeNull()
    expect(state.robots[0].pitPhase).toBeUndefined()
    expect(state.robots[0].position).toEqual(reboot)

    const instant = robotPlaybackReducer(createRobotPlaybackState(robots), { type: 'enqueue', action: move('MOVE_2') })
    expect(instant.pitPhase).toBeNull()
    expect(instant.robots[0].position).toEqual(reboot)
    expect(robotPlaybackReducer(instant, { type: 'complete' }).active).toBeNull()
  })

  it('times each pit phase', () => {
    expect(pitPhaseDuration('move')).toBe(ROBOT_MOVE_DURATION_MS)
    expect(pitPhaseDuration('fall')).toBe(PIT_FALL_DURATION_MS)
    expect(pitPhaseDuration('respawn')).toBe(PIT_RESPAWN_DURATION_MS)
  })
})
