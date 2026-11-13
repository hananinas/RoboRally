import { expectTypeOf, test } from 'vitest'
import type {
  EnvironmentStepResolved,
  ExecutionState,
  PublicGameState,
  RobotActionResolved,
  ServerToClientEvents,
} from '../src/index.js'

test('environment results do not require or reveal a programming card', () => {
  const result = {
    gameId: 'game',
    kind: 'CHECKPOINTS',
    sequence: 2,
    checkpointProgress: [{ playerId: 'player', lastCheckpoint: 1 }],
  } satisfies EnvironmentStepResolved

  expectTypeOf<ServerToClientEvents['environment.stepResolved']>()
    .toBeCallableWith(result)
  expectTypeOf<EnvironmentStepResolved>().not.toMatchTypeOf<RobotActionResolved>()
  expectTypeOf<EnvironmentStepResolved>().not.toHaveProperty('instruction')
})

test('environment results require recovery identifiers and complete robot positions', () => {
  const withoutSequence = {
    gameId: 'game',
    kind: 'CHECKPOINTS', checkpointProgress: [],
  } as const
  expectTypeOf(withoutSequence).not.toMatchTypeOf<EnvironmentStepResolved>()
  expectTypeOf<{ robotId: string; position: { x: number; y: number } }>()
    .not.toMatchTypeOf<Extract<EnvironmentStepResolved, { kind: 'GEARS' }>['robots'][number]>()
})

test('each step carries only its own changes', () => {
  expectTypeOf<{ gameId: string; sequence: number; kind: 'GEARS'; robots: []; checkpointProgress: [] }>()
    .not.toMatchTypeOf<EnvironmentStepResolved>()
  expectTypeOf<{ gameId: string; sequence: number; kind: 'CHECKPOINTS'; checkpointProgress: []; robots: [] }>()
    .not.toMatchTypeOf<EnvironmentStepResolved>()
})

test('execution state identifies the last environment result included in a snapshot', () => {
  expectTypeOf<PublicGameState['execution']>().toEqualTypeOf<ExecutionState>()
  expectTypeOf<{ lastEnvironmentSequence: number }>().toEqualTypeOf<ExecutionState>()
})
