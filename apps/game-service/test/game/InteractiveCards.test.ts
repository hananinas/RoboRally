import { describe, expect, it } from 'vitest'
import type { Instruction } from '@robo-rally/game-events'
import { Card } from '@/game/Card'
import { Deck } from '@/game/Deck'
import { Board, Direction, EmptyTile } from '@/game/index'
import { Integer } from '@/numbers'
import {
  createTestGame,
  createTestPlayer,
  createTestRobot,
  withRebootTiles,
} from '../fixtures.ts'
import { resolveRobotAction } from '../activationTestHelper.js'

function setup(instructions: Instruction[]) {
  const board = new Board(
    withRebootTiles(
      [Array.from({ length: 9 }, () => new EmptyTile())],
      { x: Integer(0), y: Integer(0) },
    ),
    { x: Integer(8), y: Integer(0), angle: 0 },
  )

  const robot = createTestRobot({
    direction: Direction.EAST,
  })

  board.placeRobot(robot.id, {
    x: Integer(0),
    y: Integer(0),
  })

  const cards = instructions.map(
    (instruction, index) =>
      new Card(`card-${index}`, instruction),
  )

  const player = createTestPlayer({
    robot,
    deck: new Deck(cards),
  })

  const game = createTestGame({
    board,
    players: [player],
    deck: cards,
  })

  game.submitProgram(
    player.id,
    cards.map((card) => card.id),
  )._unsafeUnwrap()

  return { game, player }
}

describe('Sandbox Routine', () => {
  it('offers all standard programming instructions', () => {
    const { game, player } = setup([
      'SANDBOX_ROUTINE',
      'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
    ])

    const choice = game.prepareNextChoice()

    expect(choice?.playerId).toBe(player.id)
    expect(choice?.registerIndex).toBe(0)
    expect(choice?.options).toHaveLength(7)
    expect(choice?.options).toEqual(expect.arrayContaining([
      'MOVE_1',
      'MOVE_2',
      'MOVE_3',
      'BACK_UP',
      'TURN_LEFT',
      'TURN_RIGHT',
      'U_TURN',
    ]))
  })
})

it('executes the selected movement instruction', () => {
  const { game, player } = setup([
    'SANDBOX_ROUTINE',
    'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
  ])

  const choice = game.prepareNextChoice()!

  game.chooseCardAction(player.id, {
    choiceId: choice.choiceId,
    instruction: 'MOVE_2',
  })._unsafeUnwrap()

  const { action } = resolveRobotAction(game)

  expect(action.resolvedInstruction).toBe('MOVE_2')
  expect(action.position.x).toBe(2)
  expect(game.pendingChoice).toBeNull()
})

describe('Weasel Routine', () => {
  it('only offers rotation instructions', () => {
    const { game } = setup([
      'WEASEL_ROUTINE',
      'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
    ])

    const choice = game.prepareNextChoice()

    expect(choice?.options).toEqual([
      'TURN_LEFT',
      'TURN_RIGHT',
      'U_TURN',
    ])
  })
})

it('executes the selected rotation instruction', () => {
  const { game, player } = setup([
    'WEASEL_ROUTINE',
    'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
  ])

  const choice = game.prepareNextChoice()!

  game.chooseCardAction(player.id, {
    choiceId: choice.choiceId,
    instruction: 'TURN_LEFT',
  })._unsafeUnwrap()

  const { action } = resolveRobotAction(game)

  expect(action.resolvedInstruction).toBe('TURN_LEFT')
  expect(action.direction).toBe(Direction.NORTH)
  expect(action.position.x).toBe(0)
  expect(action.position.y).toBe(0)
})

describe('Interactive card validation', () => {
  it('rejects an instruction not offered by the card', () => {
    const { game, player } = setup([
      'WEASEL_ROUTINE',
      'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
    ])

    const choice = game.prepareNextChoice()!

    const result = game.chooseCardAction(player.id, {
      choiceId: choice.choiceId,
      instruction: 'MOVE_3',
    })

    expect(result.isErr()).toBe(true)
    expect(game.pendingChoice).not.toBeNull()
  })
})

it('prevents execution until an action is selected', () => {
  const { game } = setup([
    'SANDBOX_ROUTINE',
    'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1',
  ])

  game.prepareNextChoice()

  expect(() => game.executeNextAction()).toThrow(
    'An interactive card requires a choice before execution',
  )

  expect(game.pendingChoice).not.toBeNull()
})