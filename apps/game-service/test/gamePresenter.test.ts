import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  CardsDealt,
  PublicGameState,
  RobotActionResolved,
  Tile as TilePayload,
} from '@robo-rally/game-events'
import {
  Board,
  Card,
  Direction,
  EmptyTile,
  Game,
  PitTile,
  Player,
  Robot,
  createGame,
  type TileKind,
} from '@/game/index.ts'
import {
  presentCardsDealt,
  presentPublicGameState,
  presentRobotActionResolved,
} from '@/socket/gamePresenter.ts'
import { Integer } from '@/numbers'

function createGameWithPlayer() {
    const { gameId, game } = createGame('empty-map', undefined, () => 0)
  const player = game.addPlayer()._unsafeUnwrap()
  return { gameId, game, player }
}

describe('game presenter', () => {
  it('serializes pushed robot positions and orientations alongside the acting robot', () => {
    const { game, player } = createGameWithPlayer()
    const resolvedInstruction = player.hand[0].instruction === 'AGAIN' ? undefined : player.hand[0].instruction
    const resolved = presentRobotActionResolved('game', game, {
      registerIndex: 0,
      registers: player.registers,
      action: {
        robotId: player.robot.id,
        card: player.hand[0],
        resolvedInstruction,
        position: { x: Integer(2), y: Integer(3) },
        direction: Direction.EAST,
      },
      pushedRobots: [
        { robotId: 'pushed', position: { x: Integer(3), y: Integer(3) }, direction: Direction.NORTH },
        { robotId: 'rebooted', position: { x: Integer(0), y: Integer(0) }, direction: Direction.WEST },
      ],
      roundConcluded: false,
    })

    expect(resolved.pushedRobots).toEqual([
      { robotId: 'pushed', position: { coordinate: { x: 3, y: 3 }, orientation: 'NORTH' } },
      { robotId: 'rebooted', position: { coordinate: { x: 0, y: 0 }, orientation: 'WEST' } },
    ])
  })

  it('keeps domain tile kinds exhaustively compatible with public tile types', () => {
    expectTypeOf<TileKind>().toEqualTypeOf<TilePayload['type']>()
  })

  it('serializes pits alongside empty tiles, walls and checkpoints', () => {
    const board = new Board([[
      new EmptyTile(),
      new PitTile(),
      new PitTile([Direction.NORTH, Direction.WEST]),
      new EmptyTile([Direction.SOUTH], 1),
    ]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_1'))
    const game = new Game({ board, players: [], deck: cards, rebootTile: { x: Integer(0), y: Integer(0) }, random: () => 0 })
    const state = presentPublicGameState('game', game)

    expect(state.checkpointCount).toBe(1)
    expect(state.board.tiles).toEqual([
      { position: { x: 0, y: 0 }, type: 'EMPTY' },
      { position: { x: 1, y: 0 }, type: 'PIT' },
      { position: { x: 2, y: 0 }, type: 'PIT', walls: ['NORTH', 'WEST'] },
      { position: { x: 3, y: 0 }, type: 'EMPTY', walls: ['SOUTH'], checkpointNumber: 1 },
    ])
  })

  it('presents a complete public programming state in row-major order', () => {
    const { gameId, game, player } = createGameWithPlayer()
    const state = presentPublicGameState(gameId, game)

    expectTypeOf(state).toEqualTypeOf<PublicGameState>()
    expect(state).toMatchObject({
      gameId,
      checkpointCount: 2,
      board: { width: 21, height: 15 },
      phase: 'PROGRAMMING',
      winner: null,
      robots: [
        {
          robotId: player.robot.id,
          colour: player.robot.colour,
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
    expect(state.board.tiles.filter((tile) => tile.checkpointNumber !== undefined)).toEqual([
      { position: { x: 10, y: 6 }, type: 'EMPTY', checkpointNumber: 1 },
      { position: { x: 8, y: 9 }, type: 'EMPTY', checkpointNumber: 2 },
    ])
  })

  it('maps tile walls and the activation phase to contract values', () => {
    const board = new Board([
      [
        new EmptyTile([Direction.NORTH, Direction.WEST], 1),
        new EmptyTile(),
      ],
    ], { x: Integer(1), y: Integer(0), angle: Math.PI / 2 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    const cards = Array.from(
      { length: 5 },
      (_, index) => new Card(`card-${index}`, 'MOVE_1'),
    )
    player.deck.add(cards)
    const game = new Game({ board, players: [player], deck: cards, rebootTile: { x: Integer(0), y: Integer(0) } })
    game.submitProgram(player.id, cards.map((card) => card.id))

    const state = presentPublicGameState('game', game)

    expect(state.phase).toBe('EXECUTING')
    expect(state.board.tiles).toEqual([
      {
        position: { x: 0, y: 0 },
        type: 'EMPTY',
        walls: ['NORTH', 'WEST'],
        checkpointNumber: 1,
      },
      { position: { x: 1, y: 0 }, type: 'EMPTY' },
    ])
    expect(state.robots[0].position.orientation).toBe('EAST')
  })

  it('presents the winner once a player completes the final checkpoint', () => {
    const board = new Board([
      [new EmptyTile(), new EmptyTile([], 1), new EmptyTile()],
    ], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    const robot = new Robot('robot', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
    const player = new Player('player', robot)
    const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, 'MOVE_1'))
    player.deck.add(cards)
    const game = new Game({ board, players: [player], deck: cards, rebootTile: { x: Integer(0), y: Integer(0) } })
    game.submitProgram(player.id, cards.map((card) => card.id))
    expect(presentPublicGameState('game', game).winner).toBeNull()

    game.executeNextAction()

    expect(game.winner).toBe(player.id)
    const winner = { playerId: player.id, username: 'Winner' }
    expect(presentPublicGameState('game', game, [], winner).winner).toEqual(winner)
  })

  it('presents all dealt card instruction types without exposing domain objects', () => {
    const { gameId, player } = createGameWithPlayer()
    const dealt = presentCardsDealt(gameId, player)

    expectTypeOf(dealt).toEqualTypeOf<CardsDealt>()
    expect(dealt.cards).toHaveLength(9)
    expect(dealt.cards.map((card) => card.instruction)).toEqual([
      'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_1', 'MOVE_2', 'MOVE_2', 'MOVE_2', 'MOVE_3', 'BACK_UP',
    ])
    expect(dealt.cards[0]).toEqual({
      id: player.hand[0].id,
      instruction: 'MOVE_1',
    })
    expect(dealt.cards[0]).not.toBe(player.hand[0])
  })

  it.each([
    { instruction: 'MOVE_1' }, { instruction: 'MOVE_2' }, { instruction: 'MOVE_3' },
    { instruction: 'BACK_UP' }, { instruction: 'TURN_LEFT' }, { instruction: 'TURN_RIGHT' },
    { instruction: 'U_TURN' }, { instruction: 'AGAIN' },
  ] as const)('presents a resolved $instruction action', ({ instruction }) => {
    const { game, player } = createGameWithPlayer()
    const resolvedInstruction = instruction === 'AGAIN' ? undefined : instruction
    const action = {
      robotId: player.robot.id,
      card: new Card('card', instruction),
      resolvedInstruction,
      position: { x: Integer(4), y: Integer(5) },
      direction: Direction.SOUTH,
    }

    const resolved = presentRobotActionResolved('game', game, { registerIndex: 4, action, pushedRobots: [], registers: player.registers, roundConcluded: false })

    expectTypeOf(resolved).toEqualTypeOf<RobotActionResolved>()
    expect(resolved).toEqual({
      gameId: 'game',
      registerIndex: 4,
      robotId: player.robot.id,
      playerId: player.id,
      instruction,
      resolvedInstruction: resolvedInstruction ?? null,
      pushedRobots: [],
      position: {
        coordinate: { x: 4, y: 5 },
        orientation: 'SOUTH',
      },
    })
  })

})
