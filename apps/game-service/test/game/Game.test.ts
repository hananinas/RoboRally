import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, PitTile, Game, Card, Player, Robot } from '@/game/index'
import { Integer, PositiveInteger } from '@/numbers'

function createGame() {
  const board = new Board([
    [new EmptyTile(), new EmptyTile()],
    [new EmptyTile(), new EmptyTile()],
  ], { x: Integer(1), y: Integer(1), angle: Math.PI / 2 })
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
  const game = new Game(board, [player], deck, undefined, { x: Integer(0), y: Integer(1) })
  return { board, robot, player, deck, game }
}

describe('Game programming', () => {
  it('executes the additional card types from main in register order', () => {
    const board = new Board(Array.from({ length: 15 }, () =>
      Array.from({ length: 15 }, () => new EmptyTile()),
    ), { x: Integer(7), y: Integer(0), angle: Math.PI / 2 })
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
    const game = new Game(board, [player], deck, undefined, { x: Integer(0), y: Integer(0) })
    game.submitProgram(player.id, deck.map((card) => card.id))

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
    const programIds = program.map((card) => card.id)

    game.submitProgram(player.id, programIds)

    expect(robot.program).toEqual(program)
    expect(game.phase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(game.submitProgram(player.id, programIds)._unsafeUnwrapErr()).toBe('WRONG_PHASE')
  })

  it('rejects invalid submissions without changing the robot or game phase', () => {
    const { robot, player, deck, game } = createGame()
    const validIds = deck.slice(0, 5).map((card) => card.id)

    expect(game.submitProgram('unknown', validIds)._unsafeUnwrapErr()).toBe('PLAYER_NOT_IN_GAME')
    expect(game.submitProgram(player.id, deck.slice(0, 4).map((card) => card.id))._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram(player.id, [deck[0].id, deck[0].id, ...deck.slice(1, 4).map((card) => card.id)])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram(player.id, [...deck.slice(0, 4).map((card) => card.id), 'foreign'])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')

    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])
    game.submitProgram(player.id, validIds)
    expect(game.phase).toBe('activation')
  })

  it('accepts an empty roster but requires unique players and at least five distinct cards', () => {
    const { board, player, deck, game } = createGame()
    expect(new Game(board, [], deck, undefined, game.rebootTile).players).toEqual([])
    expect(() => new Game(board, [player, player], deck, undefined, game.rebootTile)).toThrow(RangeError)
    expect(() => new Game(board, [player], deck.slice(0, 4), undefined, game.rebootTile)).toThrow(RangeError)
    expect(() => new Game(board, [player], [deck[0], deck[0], ...deck.slice(1, 5)], undefined, game.rebootTile)).toThrow(RangeError)
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
    const validIds = deck.slice(0, 5).map((card) => card.id)

    game.pause()
    expect(game.submitProgram(player.id, validIds)._unsafeUnwrapErr()).toBe('GAME_PAUSED')
    expect(game.phase).toBe('programming')
    expect(robot.program).toEqual([])

    game.resume()
    game.submitProgram(player.id, validIds)
    expect(game.phase).toBe('activation')
  })

  it('still executes an already-committed action while paused', () => {
    const { player, deck, game } = createGame()
    game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))

    game.pause()
    expect(() => game.executeNextAction()).not.toThrow()
    expect(game.currentRegister).toBe(1)
  })

  it('blocks program submission once aborted, even over a pause', () => {
    const { player, deck, game } = createGame()
    const validIds = deck.slice(0, 5).map((card) => card.id)

    game.abort()
    expect(game.submitProgram(player.id, validIds)._unsafeUnwrapErr()).toBe('GAME_ABORTED')

    game.pause()
    expect(game.submitProgram(player.id, validIds)._unsafeUnwrapErr()).toBe('GAME_ABORTED')
  })

})

describe('Game.addPlayer', () => {
  function createEmptyGame(width = 3) {
    const board = new Board([Array.from({ length: width }, () => new EmptyTile())], { x: Integer(width - 1), y: Integer(0), angle: Math.PI / 2 })
    const deck = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    return { board, deck, game: new Game(board, [], deck, undefined, { x: Integer(0), y: Integer(0) }) }
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
    game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))

    const result = game.addPlayer()

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('GAME_ALREADY_STARTED')
  })

  it('rejects adding a player when no spawn tile is free', () => {
    const { game } = createEmptyGame(2)
    game.addPlayer()._unsafeUnwrap()

    const result = game.addPlayer()

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('skips the antenna in spawn order and reports when spawn positions are exhausted', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new EmptyTile(), new EmptyTile()]], {
      x: Integer(1), y: Integer(0), angle: 0,
    })
    const game = new Game(board, [], deck, undefined, { x: Integer(0), y: Integer(0) })
    const player = game.addPlayer()._unsafeUnwrap()

    expect(board.positionOf(player.robot.id)).toEqual({ x: 0, y: 0 })
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(board.occupantAt(board.antenna)).toBeUndefined()
    expect(game.players).toEqual([player])
  })

  it('has a name, which defaults when none is given', () => {
    const { game, deck } = createGame()
    expect(game.name).toBe('Game')
    const named = new Game(
      new Board([[new EmptyTile(), new EmptyTile()]], { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }),
      [],
      deck,
      'Shared game',
      { x: Integer(1), y: Integer(0) },
    )
    expect(named.name).toBe('Shared game')
  })

})

describe('Game reboot configuration and spawning', () => {
  it('requires a reboot tile on boards with or without pits', () => {
    const { game, deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })

    expect(() => new Game(game.board, [], deck)).toThrow('requires a reboot tile')
    expect(() => new Game(board, [], deck)).toThrow('requires a reboot tile')
    expect(() => new Game(board, [], deck, undefined, { x: Integer(0), y: Integer(0) })).not.toThrow()
  })

  it('copies and freezes a valid reboot tile, even when occupied', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    const player = new Player('player', new Robot('robot', Direction.NORTH))
    board.placeRobot(player.robot.id, { x: Integer(0), y: Integer(0) })
    const rebootTile = { x: Integer(0), y: Integer(0) }
    const game = new Game(board, [player], deck, undefined, rebootTile)
    rebootTile.x = Integer(1)

    expect(game.rebootTile).toEqual({ x: 0, y: 0 })
    expect(() => Object.assign(game.rebootTile, { x: 1 })).toThrow()
    expect(board.positionOf(player.robot.id)).toEqual({ x: 0, y: 0 })
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('rejects reboot coordinates outside the board, on pits or on the antenna', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    for (const rebootTile of [
      { x: Integer(-1), y: Integer(0) }, { x: Integer(0), y: Integer(1) },
      { x: Integer(1), y: Integer(0) }, { x: Integer(2), y: Integer(0) },
    ]) {
      expect(() => new Game(board, [], deck, undefined, rebootTile)).toThrow(RangeError)
    }
  })

  it('rejects a roster whose robot is already standing on a pit', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    const player = new Player('player', new Robot('robot', Direction.EAST))
    board.placeRobot(player.robot.id, { x: Integer(0), y: Integer(0) })
    board.moveRobot(player.robot.id, Direction.EAST, PositiveInteger(1))

    expect(() => new Game(board, [player], deck, undefined, { x: Integer(0), y: Integer(0) }))
      .toThrow('Robots cannot start on pits')
  })

  it('skips pits in the existing join order and reports when no safe spawn remains', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 })
    const game = new Game(board, [], deck, undefined, { x: Integer(0), y: Integer(0) })
    const first = game.addPlayer()._unsafeUnwrap()

    expect(board.positionOf(first.robot.id)).toEqual({ x: 0, y: 0 })
    expect(first.hand.map((card) => card.instruction)).toEqual(deck.map((card) => card.instruction))
    expect(game.addPlayer()._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(game.players).toEqual([first])
    expect(board.occupantAt({ x: Integer(1), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
  })
})
