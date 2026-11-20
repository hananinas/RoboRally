import { resolveRobotAction } from '../activationTestHelper.js'
import { describe, expect, it } from 'vitest'
import { Board, Card, Deck, Direction, EmptyTile, PitTile } from '@/game/index'
import { Integer } from '@/numbers'
import { createEmptyTileGrid, createTestGame, placeTestPlayer } from '../fixtures.ts'

function createGame() {
  const board = new Board(createEmptyTileGrid(2, 2), { x: Integer(1), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) })
  const deck: Card[] = [
    new Card('move-1', 'MOVE_1'),
    new Card('left-1', 'TURN_LEFT'),
    new Card('move-2', 'MOVE_1'),
    new Card('left-2', 'TURN_LEFT'),
    new Card('move-3', 'MOVE_1'),
    new Card('left-3', 'TURN_LEFT'),
  ]
  const player = placeTestPlayer(board, { x: Integer(0), y: Integer(0) }, { direction: Direction.EAST, deck: new Deck(deck) })
  const robot = player.robot
  const game = createTestGame({ board, players: [player], deck })
  return { board, robot, player, deck, game }
}

describe('Game programming', () => {
  it('executes the additional card types from main in register order', () => {
    const board = new Board(createEmptyTileGrid(15, 15), { x: Integer(7), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) })
    const deck = [
      new Card('move-2', 'MOVE_2'),
      new Card('move-3', 'MOVE_3'),
      new Card('back-up', 'BACK_UP'),
      new Card('right', 'TURN_RIGHT'),
      new Card('u-turn', 'U_TURN'),
    ]
    const player = placeTestPlayer(board, { x: Integer(5), y: Integer(5) }, { direction: Direction.EAST, deck: new Deck(deck) })
    const game = createTestGame({ board, players: [player], deck })
    game.submitProgram(player.id, deck.map((card) => card.id))

    const actions = Array.from({ length: 5 }, () => resolveRobotAction(game))
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
    expect(actions.map(({ registers }, index) => registers[index])).toEqual(
      deck.map((card) => ({ status: 'REVEALED', instruction: card.instruction })),
    )
    expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'EMPTY' })))
    expect(game.lastActivePhase).toBe('programming')
  })

  it('starts in programming and deals its card supply to the player', () => {
    const { board, robot, player, deck, game } = createGame()

    expect(game.board).toBe(board)
    expect(game.players).toEqual([player])
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(player.hand).toHaveLength(deck.length)
    expect(player.hand).toEqual(expect.arrayContaining(deck))
    expect(robot.program).toEqual([])

    deck.pop()
    expect(player.hand).toHaveLength(6)
  })

  it('resets existing register state for every player at the initial deal', () => {
    const board = new Board(createEmptyTileGrid(2, 2), { x: Integer(1), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) })
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`left-${index}`, 'TURN_LEFT'))
    const players = [0, 1].map((index) => {
      const player = placeTestPlayer(board, { x: Integer(index), y: Integer(0) }, {
        id: `player-${index}`, direction: Direction.EAST, deck: new Deck(deck),
      })
      if (index === 0) player.drawHand()
      player.updateRegisters([deck[0], deck[1], deck[2], deck[3], deck[4]])
      player.revealRegister(0, 'TURN_LEFT')
      return player
    })
    const snapshots = players.map((player) => player.registers)

    createTestGame({ board, players, deck })

    for (const player of players) {
      expect(player.registers).toEqual(Array.from({ length: 5 }, () => ({ status: 'EMPTY' })))
      expect(player.hand).toHaveLength(deck.length)
      expect(player.hand).toEqual(expect.arrayContaining(deck))
    }
    for (const snapshot of snapshots) {
      expect(snapshot[0]).toEqual({ status: 'REVEALED', instruction: 'TURN_LEFT' })
    }
  })

  it('preserves the selected order and enters activation after a valid submission', () => {
    const { robot, player, deck, game } = createGame()
    const program = [deck[5], deck[0], deck[3], deck[2], deck[1]]
    const programIds = program.map((card) => card.id)

    game.submitProgram(player.id, programIds)

    expect(robot.program).toEqual(program)
    expect(game.lastActivePhase).toBe('activation')
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

    expect(game.lastActivePhase).toBe('programming')
    expect(robot.program).toEqual([])
    game.submitProgram(player.id, validIds)
    expect(game.lastActivePhase).toBe('activation')
  })

  it('accepts an empty roster but requires unique players and at least five distinct cards', () => {
    const { board, player, deck } = createGame()
    expect(createTestGame({ board, players: [], deck }).players).toEqual([])
    expect(() => createTestGame({ board, players: [player, player], deck })).toThrow(RangeError)
    expect(() => createTestGame({ board, players: [player], deck: deck.slice(0, 4) })).toThrow(RangeError)
    expect(() => createTestGame({ board, players: [player], deck: [deck[0], deck[0], ...deck.slice(1, 5)] })).toThrow(RangeError)
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
    expect(game.lastActivePhase).toBe('programming')
    expect(robot.program).toEqual([])

    game.resume()
    game.submitProgram(player.id, validIds)
    expect(game.lastActivePhase).toBe('activation')
  })

  it('rejects an already-scheduled action once paused', () => {
    const { player, deck, game } = createGame()
    game.submitProgram(player.id, deck.slice(0, 5).map((card) => card.id))

    game.pause()
    expect(() => resolveRobotAction(game)).toThrow()
    expect(game.currentRegister).toBe(0)
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
    const board = new Board(createEmptyTileGrid(width, 1), { x: Integer(width - 1), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) })
    const deck = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    return { board, deck, game: createTestGame({ board, players: [], deck }) }
  }

  it('creates and places a player with a private hand drawn from the deck', () => {
    const { board, deck, game } = createEmptyGame()

    const result = game.addPlayer('red')

    expect(result.isOk()).toBe(true)
    const player = result._unsafeUnwrap()
    expect(game.players).toEqual([player])
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(board.positionOf(player.robot.id)).toEqual({ x: 1, y: 0 })
    expect(player.hand).toHaveLength(deck.length)
    expect(player.hand.map((card) => card.instruction).sort()).toEqual(deck.map((card) => card.instruction).sort())
    expect(player.hand.map((card) => card.id)).not.toEqual(deck.map((card) => card.id))
  })

  it('gives each added player a hand with distinct card IDs', () => {
    const { game } = createEmptyGame()

    const first = game.addPlayer('red')._unsafeUnwrap()
    const second = game.addPlayer('blue')._unsafeUnwrap()

    expect(second.hand.every((card) => !first.hand.some((other) => other.id === card.id))).toBe(true)
  })

  it('rejects adding a player when no spawn tile is free', () => {
    const { game } = createEmptyGame(2)
    game.addPlayer('red')._unsafeUnwrap()

    const result = game.addPlayer('blue')

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('skips the antenna in spawn order and reports when spawn positions are exhausted', () => {
    const { deck } = createGame()
    const board = new Board(createEmptyTileGrid(3, 1), {
      x: Integer(1), y: Integer(0), angle: 0,
    }, { x: Integer(0), y: Integer(0) })
    const game = createTestGame({ board, players: [], deck })
    const player = game.addPlayer('red')._unsafeUnwrap()

    expect(board.positionOf(player.robot.id)).toEqual({ x: 0, y: 0 })
    expect(game.addPlayer('blue')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(board.occupantAt(board.antenna)).toBeUndefined()
    expect(game.players).toEqual([player])
  })

  it('stores the given name', () => {
    const { deck } = createGame()
    const named = createTestGame({
      board: new Board(createEmptyTileGrid(2, 1), { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(1), y: Integer(0) }),
      players: [],
      deck,
      name: 'Shared game',
    })
    expect(named.name).toBe('Shared game')
  })
})

describe('Game roster validation and spawn skipping', () => {
  it('rejects a roster whose robot is already standing on a pit', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) })
    const player = placeTestPlayer(board, { x: Integer(0), y: Integer(0) }, { direction: Direction.EAST, deck: new Deck(deck) })
    board.pushRobot(player.robot.id, Direction.EAST)

    expect(() => createTestGame({ board, players: [player], deck }))
      .toThrow('Robots cannot start on pits')
  })

  it('skips pits in the existing join order and reports when no safe spawn remains', () => {
    const { deck } = createGame()
    const board = new Board([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) })
    const game = createTestGame({ board, players: [], deck })
    const first = game.addPlayer('red')._unsafeUnwrap()

    expect(board.positionOf(first.robot.id)).toEqual({ x: 0, y: 0 })
    expect(first.hand).toHaveLength(deck.length)
    expect(first.hand.map((card) => card.instruction).sort()).toEqual(deck.map((card) => card.instruction).sort())
    expect(game.addPlayer('blue')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(game.players).toEqual([first])
    expect(board.occupantAt({ x: Integer(1), y: Integer(0) })).toBeUndefined()
    expect(board.occupantAt({ x: Integer(2), y: Integer(0) })).toBeUndefined()
  })
})
