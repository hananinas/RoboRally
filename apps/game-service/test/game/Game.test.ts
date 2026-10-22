import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, PitTile, Game, Card, Player, Robot } from '@/game/index'

function createGame() {
  const board = new Board([[new EmptyTile(), new EmptyTile()]], { x: 1, y: 0, angle: Math.PI / 2 })
  const robot = new Robot('robot-1', Direction.EAST)
  board.placeRobot(robot.id, { x: 0, y: 0 })
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
    ), { x: 7, y: 0, angle: Math.PI / 2 })
    const robot = new Robot('robot-1', Direction.EAST)
    board.placeRobot(robot.id, { x: 5, y: 5 })
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

  it('has a name, which defaults when none is given', () => {
    const { game, deck } = createGame()
    expect(game.name).toBe('Game')
    const named = new Game(
      new Board([[new EmptyTile()]], { x: 0, y: 0, angle: Math.PI / 2 }),
      [],
      deck,
      'Shared game',
    )
    expect(named.name).toBe('Shared game')
  })

})

describe('Game reboot configuration and spawning', () => {
  it('requires explicit reboot configuration only when the board contains pits', () => {
    const { game, deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile()]], { x: 0, y: 0, angle: Math.PI / 2 })

    expect(game.rebootTile).toBeUndefined()
    expect(() => new Game(board, [], deck)).toThrow('requires a reboot tile')
    expect(() => new Game(board, [], deck, undefined, { x: 0, y: 0 })).not.toThrow()
  })

  it('copies and freezes a valid reboot tile, even when occupied', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile()]], { x: 0, y: 0, angle: Math.PI / 2 })
    const player = new Player('player', new Robot('robot', Direction.NORTH))
    board.placeRobot(player.robot.id, { x: 0, y: 0 })
    const rebootTile = { x: 0, y: 0 }
    const game = new Game(board, [player], deck, undefined, rebootTile)
    rebootTile.x = 1

    expect(game.rebootTile).toEqual({ x: 0, y: 0 })
    expect(() => Object.assign(game.rebootTile!, { x: 1 })).toThrow()
    expect(board.positionOf(player.robot.id)).toEqual({ x: 0, y: 0 })
    expect(player.robot.direction).toBe(Direction.NORTH)
  })

  it('rejects reboot coordinates outside the board, between tiles or on pits', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile()]], { x: 0, y: 0, angle: Math.PI / 2 })
    for (const rebootTile of [
      { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0.5, y: 0 }, { x: NaN, y: 0 }, { x: 1, y: 0 },
    ]) {
      expect(() => new Game(board, [], deck, undefined, rebootTile)).toThrow(RangeError)
    }
  })

  it('rejects a roster whose robot is already standing on a pit', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile()]], { x: 0, y: 0, angle: Math.PI / 2 })
    const player = new Player('player', new Robot('robot', Direction.EAST))
    board.placeRobot(player.robot.id, { x: 0, y: 0 })
    board.moveRobot(player.robot.id, Direction.EAST, 1)

    expect(() => new Game(board, [player], deck, undefined, { x: 0, y: 0 }))
      .toThrow('Robots cannot start on pits')
  })

  it('skips pits in the existing join order and returns false when no safe spawn remains', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: 0, y: 0, angle: Math.PI / 2 })
    const game = new Game(board, [], deck, undefined, { x: 0, y: 0 })
    const first = new Player('first', new Robot('first-robot', Direction.NORTH))
    const second = new Player('second', new Robot('second-robot', Direction.NORTH))

    expect(game.addPlayer(first)).toBe(true)
    expect(board.positionOf(first.robot.id)).toEqual({ x: 0, y: 0 })
    expect(first.hand).toEqual(deck)
    expect(game.addPlayer(second)).toBe(false)
    expect(game.players).toEqual([first])
    expect(board.occupantAt({ x: 1, y: 0 })).toBeUndefined()
    expect(board.occupantAt({ x: 2, y: 0 })).toBeUndefined()
    expect(() => board.positionOf(second.robot.id)).toThrow()
    expect(second.hand).toEqual([])
  })
})
