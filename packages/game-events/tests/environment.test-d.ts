import { expectTypeOf, test } from 'vitest'
import type {
  ActivationCursor,
  EnvironmentStepResolved,
  EnvironmentStepKind,
  ExecutionState,
  PublicGameState,
  RobotActionResolved,
  ServerToClientEvents,
} from '../src/index.js'

test('gear results and pending cursors use the existing environment contract', () => {
  expectTypeOf<EnvironmentStepKind>().toEqualTypeOf<'GEARS' | 'CHECKPOINTS'>()
  const result = {
    gameId: 'game', roundNumber: 1, registerIndex: 0, stepIndex: 0,
    kind: 'GEARS', sequence: 1,
    robots: [{ robotId: 'robot', position: { coordinate: { x: 1, y: 2 }, orientation: 'EAST' } }],
    checkpointProgress: [],
  } satisfies EnvironmentStepResolved
  expectTypeOf<ServerToClientEvents['environment.stepResolved']>().toBeCallableWith(result)
  expectTypeOf({ stage: 'ENVIRONMENT', registerIndex: 0, stepIndex: 0, kind: 'GEARS' } satisfies ActivationCursor)
    .toMatchTypeOf<ActivationCursor>()
})

test('environment results do not require or reveal a programming card', () => {
  const result = {
    gameId: 'game',
    roundNumber: 1,
    registerIndex: 0,
    stepIndex: 0,
    kind: 'CHECKPOINTS',
    sequence: 1,
    robots: [],
    checkpointProgress: [{ playerId: 'player', lastCheckpoint: 1 }],
  } satisfies EnvironmentStepResolved

  expectTypeOf<ServerToClientEvents['environment.stepResolved']>()
    .toBeCallableWith(result)
  expectTypeOf<EnvironmentStepResolved>().not.toMatchTypeOf<RobotActionResolved>()
  expectTypeOf<EnvironmentStepResolved>().not.toHaveProperty('instruction')
})

test('environment results require recovery identifiers and complete robot positions', () => {
  const withoutSequence = {
    gameId: 'game', roundNumber: 1, registerIndex: 0, stepIndex: 0,
    kind: 'CHECKPOINTS', robots: [], checkpointProgress: [],
  } as const
  expectTypeOf(withoutSequence).not.toMatchTypeOf<EnvironmentStepResolved>()
  expectTypeOf<{ robotId: string; position: { x: number; y: number } }>()
    .not.toMatchTypeOf<EnvironmentStepResolved['robots'][number]>()
})

test('reconnect cursors distinguish pending robot and environment steps', () => {
  const programming = {
    roundNumber: 2, lastEnvironmentSequence: 5, activation: null,
  } satisfies ExecutionState
  const robots = { stage: 'ROBOTS', registerIndex: 0 } satisfies ActivationCursor
  const environment = {
    stage: 'ENVIRONMENT', registerIndex: 4, stepIndex: 0, kind: 'CHECKPOINTS',
  } satisfies ActivationCursor

  expectTypeOf(programming).toMatchTypeOf<ExecutionState>()
  expectTypeOf({ ...programming, activation: robots }).toMatchTypeOf<ExecutionState>()
  expectTypeOf({ ...programming, activation: environment }).toMatchTypeOf<ExecutionState>()
  expectTypeOf<{ stage: 'ENVIRONMENT'; registerIndex: number }>()
    .not.toMatchTypeOf<ActivationCursor>()
  expectTypeOf<PublicGameState['execution']>().toEqualTypeOf<ExecutionState | undefined>()
})
