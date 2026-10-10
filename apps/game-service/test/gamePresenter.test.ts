import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  CardsDealt,
  PublicGameState,
  RobotActionResolved,
} from '@robo-rally/game-events'
import {
  Board,
  Card,
  Direction,
  EmptyTile,
  Game,
  Player,
  Robot,
  createSinglePlayerGame,
} from '@/game/index.ts'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from '@/gamePresenter.ts'
import { Integer } from '@/numbers'

describe('game presenter', () => {
  it('presents a complete public programming state in row-major order', () => {
    const { gameId, game, player } = createSinglePlayerGame()
    const state = presentPublicGameState(gameId, game)

    expectTypeOf(state).toEqualTypeOf<PublicGameState>()
    expect(state).toMatchObject({
      gameId,
      board: { width: 21, height: 15 },
      phase: 'PROGRAMMING',
      robots: [
        {
          robotId: player.robot.id,
          playerId: player.id,
          position: {
            coordinate: { x: 10, y: 7 },
            orientation: 'NORTH',
          },
        },
      ],
    })
    expect(state.board.tiles).toHaveLength(315)
    expect(state.board.tiles[0]).toEqual({
      position: { x: 0, y: 0 },
      type: 'EMPTY',
    })
    expect(state.board.tiles.at(-1)).toEqual({
      position: { x: 20, y: 14 },
      type: 'EMPTY',
    })
  })

  it('maps tile walls and the activation phase to contract values', () => {
    const board = new Board([
      [
        new EmptyTile([Direction.NORTH, Direction.WEST]),
        new EmptyTile(),
      ],
    ])
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    const cards = Array.from(
      { length: 5 },
      (_, index) => new Card(`card-${index}`, 'MOVE_1'),
    )
    const game = new Game(board, [player], cards)
    game.submitProgram(player.id, cards)

    const state = presentPublicGameState('game', game)

    expect(state.phase).toBe('EXECUTING')
    expect(state.board.tiles).toEqual([
      {
        position: { x: 0, y: 0 },
        type: 'EMPTY',
        walls: ['NORTH', 'WEST'],
      },
      { position: { x: 1, y: 0 }, type: 'EMPTY' },
    ])
    expect(state.robots[0].position.orientation).toBe('EAST')
  })

  it('presents all dealt card instruction types without exposing domain objects', () => {
    const { gameId, player } = createSinglePlayerGame()
    const dealt = presentCardsDealt(gameId, player)

    expectTypeOf(dealt).toEqualTypeOf<CardsDealt>()
    expect(dealt.cards).toHaveLength(9)
    expect(dealt.cards.map((card) => card.instruction)).toEqual([
      'MOVE_1',
      'MOVE_2',
      'MOVE_3',
      'BACK_UP',
      'TURN_LEFT',
      'TURN_RIGHT',
      'U_TURN',
      'MOVE_1',
      'TURN_LEFT',
    ])
    expect(dealt.cards[0]).toEqual({
      id: player.hand[0].id,
      instruction: 'MOVE_1',
    })
    expect(dealt.cards[0]).not.toBe(player.hand[0])
  })

  it.each([
    { cardIndex: 0, instruction: 'MOVE_1' },
    { cardIndex: 1, instruction: 'MOVE_2' }, { cardIndex: 2, instruction: 'MOVE_3' },
    { cardIndex: 3, instruction: 'BACK_UP' }, { cardIndex: 4, instruction: 'TURN_LEFT' },
    { cardIndex: 5, instruction: 'TURN_RIGHT' }, { cardIndex: 6, instruction: 'U_TURN' },
  ] as const)('presents a resolved $instruction action', ({ cardIndex, instruction }) => {
    const { player } = createSinglePlayerGame()
    const action = {
      robotId: player.robot.id,
      card: player.hand[cardIndex],
      position: { x: Integer(4), y: Integer(5) },
      direction: Direction.SOUTH,
    }

    const resolved = presentRobotActionResolved('game', { registerIndex: 4, action })

    expectTypeOf(resolved).toEqualTypeOf<RobotActionResolved>()
    expect(resolved).toEqual({
      gameId: 'game',
      registerIndex: 4,
      robotId: player.robot.id,
      instruction,
      position: {
        coordinate: { x: 4, y: 5 },
        orientation: 'SOUTH',
      },
    })
  })
})
