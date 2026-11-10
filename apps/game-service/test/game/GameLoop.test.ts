import type { Instruction } from '@robo-rally/game-events'
import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Card, Player, Robot } from '@/game/index'
import { Integer } from '@/numbers'

function createGame(deck: Card[]) {
  const board = new Board(Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => new EmptyTile()),
  ), { x: Integer(0), y: Integer(0), angle: Math.PI / 2 })
  const robot = new Robot('robot-1', Direction.EAST)
  board.placeRobot(robot.id, { x: Integer(1), y: Integer(1) })
  const player = new Player('player-1', robot)
  player.deck.add(deck)
  const game = new Game({ board, players: [player], deck, rebootTile: { x: Integer(0), y: Integer(2) }, random: () => 0 })
  return { board, robot, player, game }
}

describe('Game activation loop', () => {
  it('executes one action per call and returns to programming after five registers', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`left-${index}`, 'TURN_LEFT'))
    const { robot, player, game } = createGame(deck)
    expect(() => game.executeNextAction()).toThrow()
    game.submitProgram(player.id, deck.map((card) => card.id))

    const directions = [
      Direction.NORTH,
      Direction.WEST,
      Direction.SOUTH,
      Direction.EAST,
      Direction.NORTH,
    ]
    for (let registerIndex = 0; registerIndex < 5; registerIndex++) {
      const result = game.executeNextAction()
      expect(result).toEqual({
        registerIndex,
        pushedRobots: [],
        registers: Array.from({ length: 5 }, (_, index) => index <= registerIndex
          ? { status: 'REVEALED', instruction: 'TURN_LEFT' }
          : { status: 'HIDDEN' }),
        action: {
          robotId: robot.id,
          card: deck[registerIndex],
          resolvedInstruction: 'TURN_LEFT',
          position: { x: 1, y: 1 },
          direction: directions[registerIndex],
        },
      })
      expect(game.currentRegister).toBe(registerIndex === 4 ? 0 : registerIndex + 1)
      expect(game.phase).toBe(registerIndex === 4 ? 'programming' : 'activation')
    }

    expect(robot.program).toEqual([])
    expect(player.hand).toEqual(deck)
    expect(() => game.executeNextAction()).toThrow()

    game.submitProgram(player.id, deck.map((card) => card.id))
    expect(game.executeNextAction()).toMatchObject({ registerIndex: 0 })
    expect(robot.direction).toBe(Direction.WEST)
  })

  it('interprets movement through Board using the direction after a turn', () => {
    const deck: Card[] = [
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-1', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('left-3', 'TURN_LEFT'),
      new Card('left-4', 'TURN_LEFT'),
    ]
    const { board, player, game } = createGame(deck)
    game.submitProgram(player.id, deck.map((card) => card.id))

    game.executeNextAction()
    const result = game.executeNextAction()

    expect(result.action.position).toEqual({ x: 1, y: 0 })
    expect(board.positionOf('robot-1')).toEqual({ x: 1, y: 0 })
    expect(result.action.card).toBe(deck[1])
    expect(result.action.direction).toBe(Direction.NORTH)
    expect(game.executeNextAction().action.direction).toBe(Direction.WEST)
  })

  it('reports the position reached by movement', () => {
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`move-${index}`, 'MOVE_1'))
    const { board, player, game } = createGame(deck)
    game.submitProgram(player.id, deck.map((card) => card.id))

    const result = game.executeNextAction()

    expect(result.action.position).toEqual({ x: 2, y: 1 })
    expect(board.positionOf('robot-1')).toEqual({ x: 2, y: 1 })
  })
})

function resolveCard(instruction: Instruction, direction: Direction, tiles: EmptyTile[][]) {
  const board = new Board(tiles, { x: Integer(3), y: Integer(0), angle: Math.PI / 2 })
  const robot = new Robot('robot', direction)
  board.placeRobot(robot.id, { x: Integer(3), y: Integer(3) })
  const player = new Player('player', robot)
  const cards = Array.from({ length: 5 }, (_, index) => new Card(`card-${index}`, instruction))
  player.deck.add(cards)
  const game = new Game({ board, players: [player], deck: cards, rebootTile: { x: Integer(0), y: Integer(0) }, random: () => 0 })
  game.submitProgram(player.id, cards.map((card) => card.id))
  return game.executeNextAction().action
}

function tiles() {
  return Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => new EmptyTile()))
}

describe('programming card effects', () => {
  it.each([
    ['MOVE_1', 4], ['MOVE_2', 5], ['MOVE_3', 6], ['BACK_UP', 2],
  ] as const)('executes %s without changing facing', (instruction, x) => {
    const action = resolveCard(instruction, Direction.EAST, tiles())
    expect(action.position).toEqual({ x, y: 3 })
    expect(action.direction).toBe(Direction.EAST)
  })

  it.each(['MOVE_2', 'MOVE_3'] as const)('stops %s at walls and reboots at edges', (instruction) => {
    for (const distance of [0, 1]) {
      const grid = tiles()
      grid[3][3 + distance] = new EmptyTile([Direction.EAST])
      expect(resolveCard(instruction, Direction.EAST, grid).position).toEqual({ x: 3 + distance, y: 3 })
      expect(resolveCard(instruction, Direction.EAST, tiles().map(row => row.slice(0, 4 + distance))).position)
        .toEqual({ x: 0, y: 0 })
    }
  })

  it('blocks backing up without changing facing', () => {
    const grid = tiles()
    grid[3][3] = new EmptyTile([Direction.WEST])
    const action = resolveCard('BACK_UP', Direction.EAST, grid)
    expect(action.position).toEqual({ x: 3, y: 3 })
    expect(action.direction).toBe(Direction.EAST)
  })

  it.each([
    ['TURN_LEFT', [Direction.WEST, Direction.SOUTH, Direction.EAST, Direction.NORTH]],
    ['TURN_RIGHT', [Direction.EAST, Direction.NORTH, Direction.WEST, Direction.SOUTH]],
    ['U_TURN', [Direction.SOUTH, Direction.EAST, Direction.NORTH, Direction.WEST]],
  ] as const)('executes %s from every direction on the same tile', (instruction, expected) => {
    for (const [index, direction] of [Direction.NORTH, Direction.WEST, Direction.SOUTH, Direction.EAST].entries()) {
      const action = resolveCard(instruction, direction, tiles())
      expect(action.direction).toBe(expected[index])
      expect(action.position).toEqual({ x: 3, y: 3 })
    }
  })
})
