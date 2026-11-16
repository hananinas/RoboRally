import { expectTypeOf, test } from 'vitest'
import type {
  EnvironmentStepResolved,
  RobotActionResolved,
  ServerToClientEvents,
} from '../src/index.js'

test('environment results do not require or reveal a programming card', () => {
  const result = {
    gameId: 'game',
    kind: 'CHECKPOINTS',
    checkpointProgress: [{ playerId: 'player', lastCheckpoint: 1 }],
  } satisfies EnvironmentStepResolved

  expectTypeOf<ServerToClientEvents['environment.stepResolved']>()
    .toBeCallableWith(result)
  expectTypeOf<EnvironmentStepResolved>().not.toMatchTypeOf<RobotActionResolved>()
  expectTypeOf<EnvironmentStepResolved>().not.toHaveProperty('instruction')
})

test('gear results require complete robot positions', () => {
  expectTypeOf<{ robotId: string; position: { x: number; y: number } }>()
    .not.toMatchTypeOf<Extract<EnvironmentStepResolved, { kind: 'GEARS' }>['robots'][number]>()
})

test('each step carries only its own changes', () => {
  expectTypeOf<{ gameId: string; kind: 'GEARS'; robots: []; checkpointProgress: [] }>()
    .not.toMatchTypeOf<EnvironmentStepResolved>()
  expectTypeOf<{ gameId: string; kind: 'CHECKPOINTS'; checkpointProgress: []; robots: [] }>()
    .not.toMatchTypeOf<EnvironmentStepResolved>()
})
