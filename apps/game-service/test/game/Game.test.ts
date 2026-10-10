import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Card, Player, Robot } from '@/game/index'
import { Integer } from '@/numbers'

function createGame() {
  const board = new Board([[new EmptyTile(), new EmptyTile()]])
  const robot = new Robot('robot-1', Direction.EAST)
  board.placeRobot(robot.id, { x: Integer(0), y: Integer(0) })
  const player = new Player('player-1', robot)
  const deck: Card[] = [
    new Card('move-1', 'MOVE_1'),
    new Card('left-1', 'TURN_LEFT'),
    new Card('move-2', 'MOVE_1'),
    new Card('left-2', 'TURN_LEFT'),
    new Card('move-3', 'MOVE_1'),
    new Card('left-3', 'TURN_LEFT'),
  ]
  const game = new Game(board, [player], deck)
  return { board, robot, player, deck, game }
}

describe('Game programming', () => {
  it('executes the additional card types from main in register order', () => {
    const board = new Board(Array.from({ length: 15 }, () =>
      Array.from({ length: 15 }, () => new EmptyTile()),
    ))
    const robot = new Robot('robot-1', Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(5), y: Integer(5) })
    const player = new Player('player-1', robot)
    const deck = [
      new Card('move-2', 'MOVE_2'),
      new Card('move-3', 'MOVE_3'),
      new Card('back-up', 'BACK_UP'),
      new Card('right', 'TURN_RIGHT'),
      new Card('u-turn', 'U_TURN'),
    ]
    const game = new Game(board, [player], deck)
    game.submitProgram(player.id, deck)

    const actions = Array.from({ length: 5 }, () => game.executeNextAction())
    expect(actions.map(({ registerIndex, action }) => ({
      registerIndex,
      position: action.position,
      direction: action.direction,
    }))).toEqual([
      { registerIndex: 0, position: { x: 7, y: 5 }, direction: Direction.EAST },
      { registerIndex: 1, position: { x: 10, y: 5 }, direction: Direction.EAST },
      { registerIndex: 2, position: { x: 9, y: 5 }, direction: Direction.EAST },
      { registerIndex: 3, position: { x: 9, y: 5 }, direction: Direction.SOUTH },
      { registerIndex: 4, position: { x: 9, y: 5 }, direction: Direction.NORTH },
    ])
    expect(game.phase).toBe('programming')
  })

  it('starts in programming and deals its card supply to the player', () => {
    const { board, robot, player, deck, game } = createGame()

    expect(game.board).toBe(board)
    expect(game.players).toEqual([player])
    expect(game.phase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(player.hand).toEqual(deck)
    expect(robot.program).toEqual([])

    deck.pop()
    expect(player.hand).toHaveLength(6)
  })

  it('preserves the selected order and enters activation after a valid submission', () => {
    const { robot, player, deck, game } = createGame()
    const program = [deck[5], deck[0], deck[3], deck[2], deck[1]]

    game.submitProgram(player.id, program)

    expect(robot.program).toEqual(program)
    expect(game.phase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(() => game.submitProgram(player.id, program)).toThrow()
  })

  it('rejects invalid submissions without changing the robot or game phase', () => {
    const { robot, player, deck, game } = createGame()
    const valid = deck.slice(0, 5)

    expect(() => game.submitProgram('unknown', valid)).toThrow()
    expect(() => game.submitProgram(player.id, deck.slice(0, 4))).toThrow(RangeError)
    expect(() => game.submitProgram(player.id, [deck[0], deck[0], ...deck.slice(1, 4)])).toThrow(RangeError)
    expect(() => game.submitProgram(player.id, [...deck.slice(0, 4), new Card('foreign', 'MOVE_1')])).toThrow()
    expect(() => game.submitProgram(player.id, [new Card(deck[0].id, 'MOVE_1'), ...deck.slice(1, 5)])).toThrow()

    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])
    game.submitProgram(player.id, valid)
    expect(game.phase).toBe('activation')
  })

  it('accepts an empty roster but requires unique players and at least five distinct cards', () => {
    const { board, player, deck } = createGame()
    expect(new Game(board, [], deck).players).toEqual([])
    expect(() => new Game(board, [player, player], deck)).toThrow(RangeError)
    expect(() => new Game(board, [player], deck.slice(0, 4))).toThrow(RangeError)
    expect(() => new Game(board, [player], [deck[0], deck[0], ...deck.slice(1, 5)])).toThrow(RangeError)
  })

  it('starts unpaused and toggles via pause/resume', () => {
    const { game } = createGame()
    expect(game.paused).toBe(false)
    game.pause()
    expect(game.paused).toBe(true)
    game.resume()
    expect(game.paused).toBe(false)
  })

  it('blocks program submission while paused without changing state', () => {
    const { robot, player, deck, game } = createGame()
    const valid = deck.slice(0, 5)

    game.pause()
    expect(() => game.submitProgram(player.id, valid)).toThrow()
    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])

    game.resume()
    game.submitProgram(player.id, valid)
    expect(game.phase).toBe('activation')
  })

  it('still executes an already-committed action while paused', () => {
    const { player, deck, game } = createGame()
    game.submitProgram(player.id, deck.slice(0, 5))

    game.pause()
    expect(() => game.executeNextAction()).not.toThrow()
    expect(game.currentRegister).toBe(1)
  })

})

describe('Game.addPlayer', () => {
  function createEmptyGame(width = 3) {
    const board = new Board([Array.from({ length: width }, () => new EmptyTile())])
    const deck = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    return { board, deck, game: new Game(board, [], deck) }
  }

  it('creates and places a player with a private hand drawn from the deck', () => {
    const { board, deck, game } = createEmptyGame()

    const result = game.addPlayer()

    expect(result.isOk()).toBe(true)
    const player = result._unsafeUnwrap()
    expect(game.players).toEqual([player])
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(board.positionOf(player.robot.id)).toEqual({ x: 1, y: 0 })
    expect(player.hand.map((card) => card.instruction)).toEqual(deck.map((card) => card.instruction))
    expect(player.hand.map((card) => card.id)).not.toEqual(deck.map((card) => card.id))
  })

  it('gives each added player a hand with distinct card IDs', () => {
    const { game } = createEmptyGame()

    const first = game.addPlayer()._unsafeUnwrap()
    const second = game.addPlayer()._unsafeUnwrap()

    expect(second.hand.every((card) => !first.hand.some((other) => other.id === card.id))).toBe(true)
  })

  it('rejects adding a player once the game has started', () => {
    const { game, player, deck } = createGame()
    game.submitProgram(player.id, deck.slice(0, 5))

    const result = game.addPlayer()

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('GAME_ALREADY_STARTED')
  })

  it('rejects adding a player when no spawn tile is free', () => {
    const { game } = createEmptyGame(1)
    game.addPlayer()

    const result = game.addPlayer()

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })
})
