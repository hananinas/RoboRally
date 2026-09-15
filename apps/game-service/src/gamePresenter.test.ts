import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  CardsDealt,
  PublicGameState,
  RobotActionResolved,
} from '@robo-rally/game-events'
import {
  Board,
  Direction,
  EmptyTile,
  Game,
  Move1,
  Player,
  Robot,
  TurnLeft,
  createSinglePlayerGame,
} from './game/index.js'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from './gamePresenter.js'

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
          position: { x: 10, y: 7, orientation: 'NORTH' },
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
    board.placeRobot(robot.id, { x: 0, y: 0 })
    const player = new Player('player', robot)
    const cards = Array.from(
      { length: 5 },
      (_, index) => new Move1(`card-${index}`),
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
    const { player } = createSinglePlayerGame()
    const dealt = presentCardsDealt(player)

    expectTypeOf(dealt).toEqualTypeOf<CardsDealt>()
    expect(dealt.cards).toHaveLength(9)
    expect(dealt.cards.map((card) => card.instruction)).toEqual([
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
      'TURN_LEFT',
      'MOVE_1',
    ])
    expect(dealt.cards[0]).toEqual({
      id: player.hand[0].id,
      instruction: 'MOVE_1',
    })
    expect(dealt.cards[0]).not.toBe(player.hand[0])
  })

  it.each([
    { cardIndex: 0, instruction: 'MOVE_1' },
    { cardIndex: 1, instruction: 'TURN_LEFT' },
  ] as const)('presents a resolved $instruction action', ({ cardIndex, instruction }) => {
    const { game, player } = createSinglePlayerGame()
    const action = {
      robotId: player.robot.id,
      cardId: player.hand[cardIndex].id,
      position: { x: 4, y: 5 },
      direction: Direction.SOUTH,
    }

    const resolved = presentRobotActionResolved(game, action)

    expectTypeOf(resolved).toEqualTypeOf<RobotActionResolved>()
    expect(resolved).toEqual({
      robotId: player.robot.id,
      instruction,
      position: { x: 4, y: 5, orientation: 'SOUTH' },
    })
  })

  it('rejects actions that do not belong to the game', () => {
    const { game, player } = createSinglePlayerGame()

    expect(() =>
      presentRobotActionResolved(game, {
        robotId: player.robot.id,
        cardId: 'missing',
        position: { x: 0, y: 0 },
        direction: Direction.NORTH,
      }),
    ).toThrow('Card missing is not available')
  })
})
