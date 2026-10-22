import { Integer } from '@/numbers'
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
  createGame,
} from '@/game/index.ts'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from '@/socket/gamePresenter.ts'

function createGameWithPlayer() {
  const { gameId, game } = createGame('empty-map')
  const player = game.addPlayer()._unsafeUnwrap()
  return { gameId, game, player }
}

describe('game presenter', () => {
  it('presents a complete public programming state in row-major order', () => {
    const { gameId, game, player } = createGameWithPlayer()
    const state = presentPublicGameState(gameId, game)

    expectTypeOf(state).toEqualTypeOf<PublicGameState>()
    expect(state).toMatchObject({
      gameId,
      checkpointCount: 2,
      board: { width: 21, height: 15 },
      phase: 'PROGRAMMING',
      robots: [
        {
          robotId: player.robot.id,
          colour: player.robot.colour,
          playerId: player.id,
          position: {
            coordinate: { x: Integer(10), y: Integer(7) },
            orientation: 'NORTH',
          },
        },
      ],
    })
    expect(state.board.tiles).toHaveLength(315)
    expect(state.board.tiles[0]).toEqual({
      position: { x: Integer(0), y: Integer(0) },
      type: 'EMPTY',
    })
    expect(state.board.tiles.at(-1)).toEqual({
      position: { x: Integer(20), y: Integer(14) },
      type: 'EMPTY',
    })
    expect(state.board.tiles.filter((tile) => tile.checkpointNumber !== undefined)).toEqual([
      { position: { x: Integer(10), y: Integer(6) }, type: 'EMPTY', checkpointNumber: 1 },
      { position: { x: Integer(8), y: Integer(9) }, type: 'EMPTY', checkpointNumber: 2 },
    ])
  })

  it('maps tile walls and the activation phase to contract values', () => {
    const board = new Board([
      [
        new EmptyTile([Direction.NORTH, Direction.WEST], 1),
        new EmptyTile(),
      ],
    ], { x: Integer(0), y: Integer(0), angle: Math.PI / 2 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    const cards = Array.from(
      { length: 5 },
      (_, index) => new Card(`card-${index}`, 'MOVE_1'),
    )
    const game = new Game(board, [player], cards)
    game.submitProgram(player.id, cards.map((card) => card.id))

    const state = presentPublicGameState('game', game)

    expect(state.phase).toBe('EXECUTING')
    expect(state.board.tiles).toEqual([
      {
        position: { x: Integer(0), y: Integer(0) },
        type: 'EMPTY',
        walls: ['NORTH', 'WEST'],
        checkpointNumber: 1,
      },
      { position: { x: Integer(1), y: Integer(0) }, type: 'EMPTY' },
    ])
    expect(state.robots[0].position.orientation).toBe('EAST')
  })

  it('presents all dealt card instruction types without exposing domain objects', () => {
    const { gameId, player } = createGameWithPlayer()
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
    const { player } = createGameWithPlayer()
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
        coordinate: { x: Integer(4), y: Integer(5) },
        orientation: 'SOUTH',
      },
    })
  })

})
