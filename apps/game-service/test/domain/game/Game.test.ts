import { resolveRobotAction } from '../../activationTestHelper.js'
import { describe, expect, it } from 'vitest'
import { Card, Deck, Direction, EmptyTile, PitTile, type Position } from '@/domain/game/index'
import { Integer } from '@/numbers'
import { addTestPlayer, createEmptyTileGrid, createTestBoard, createTestGame, createTestPlacement, instructionsOf } from '../../fixtures.ts'

const emptyViews = Array.from({ length: 5 }, () => ({ kind: 'empty' }))

function createGame() {
  const board = createTestBoard(createEmptyTileGrid(2, 2), { x: Integer(1), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) }, [{ x: Integer(0), y: Integer(0) }])
  const deck: Card[] = [
    new Card('move-1', 'MOVE_1'),
    new Card('left-1', 'TURN_LEFT'),
    new Card('move-2', 'MOVE_1'),
    new Card('left-2', 'TURN_LEFT'),
    new Card('move-3', 'MOVE_1'),
    new Card('left-3', 'TURN_LEFT'),
  ]
  const placement = createTestPlacement({ x: Integer(0), y: Integer(0) }, { direction: Direction.EAST, deck: new Deck(deck) })
  const { player } = placement
  const robot = player.robot
  const game = createTestGame({ board, players: [placement], deck: instructionsOf(deck) })
  return { board, robot, player, deck, game }
}

describe('Game programming', () => {
  it('executes the additional card types from main in register order', () => {
    const board = createTestBoard(createEmptyTileGrid(15, 15), { x: Integer(7), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) }, [{ x: Integer(5), y: Integer(5) }])
    const deck = [
      new Card('move-2', 'MOVE_2'),
      new Card('move-3', 'MOVE_3'),
      new Card('back-up', 'BACK_UP'),
      new Card('right', 'TURN_RIGHT'),
      new Card('u-turn', 'U_TURN'),
    ]
    const placement = createTestPlacement({ x: Integer(5), y: Integer(5) }, { direction: Direction.EAST, deck: new Deck(deck) })
    const { player } = placement
    const game = createTestGame({ board, players: [placement], deck: instructionsOf(deck) })
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
    expect(game.registerViewsFor(player)).toEqual(emptyViews)
    expect(game.lastActivePhase).toBe('programming')
  })

  it('starts in programming and deals its card supply to the player', () => {
    const { board, player, deck, game } = createGame()

    expect(game.board).toBe(board)
    expect(game.players).toEqual([player])
    expect(game.lastActivePhase).toBe('programming')
    expect(game.currentRegister).toBe(0)
    expect(player.hand).toHaveLength(deck.length)
    expect(player.hand).toEqual(expect.arrayContaining(deck))
    expect(player.registers).toEqual([null, null, null, null, null])

    deck.pop()
    expect(player.hand).toHaveLength(6)
  })

  it('resets existing register state for every player at the initial deal', () => {
    const board = createTestBoard(createEmptyTileGrid(2, 2), { x: Integer(1), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) }, [{ x: Integer(0), y: Integer(0) }, { x: Integer(1), y: Integer(0) }])
    const deck = Array.from({ length: 5 }, (_, index) => new Card(`left-${index}`, 'TURN_LEFT'))
    const placements = [0, 1].map((index) => {
      const placement = createTestPlacement({ x: Integer(index), y: Integer(0) }, {
        id: `player-${index}`, direction: Direction.EAST, deck: new Deck(deck),
      })
      const { player } = placement
      if (index === 0) player.drawHand()
      player.updateRegisters([deck[0], deck[1], deck[2], deck[3], deck[4]])
      return placement
    })
    const players = placements.map(({ player }) => player)

    const game = createTestGame({ board, players: placements, deck: instructionsOf(deck) })

    for (const player of players) {
      expect(player.registers).toEqual([null, null, null, null, null])
      expect(game.registerViewsFor(player)).toEqual(emptyViews)
      expect(player.hand).toHaveLength(deck.length)
      expect(player.hand).toEqual(expect.arrayContaining(deck))
    }
  })

  it('preserves the selected order and enters activation after a valid submission', () => {
    const { player, deck, game } = createGame()
    const program = [deck[5], deck[0], deck[3], deck[2], deck[1]]
    const programIds = program.map((card) => card.id)

    game.submitProgram(player.id, programIds)

    expect(player.registers).toEqual(program)
    expect(game.lastActivePhase).toBe('activation')
    expect(game.currentRegister).toBe(0)
    expect(game.submitProgram(player.id, programIds)._unsafeUnwrapErr()).toBe('WRONG_PHASE')
  })

  it('rejects invalid submissions without changing the robot or game phase', () => {
    const { player, deck, game } = createGame()
    const validIds = deck.slice(0, 5).map((card) => card.id)

    expect(game.submitProgram('unknown', validIds)._unsafeUnwrapErr()).toBe('PLAYER_NOT_IN_GAME')
    expect(game.submitProgram(player.id, deck.slice(0, 4).map((card) => card.id))._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram(player.id, [deck[0].id, deck[0].id, ...deck.slice(1, 4).map((card) => card.id)])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')
    expect(game.submitProgram(player.id, [...deck.slice(0, 4).map((card) => card.id), 'foreign'])._unsafeUnwrapErr()).toBe('INVALID_PROGRAM')

    expect(game.lastActivePhase).toBe('programming')
    expect(player.registers).toEqual([null, null, null, null, null])
    game.submitProgram(player.id, validIds)
    expect(game.lastActivePhase).toBe('activation')
  })

  it('accepts an empty roster but requires unique players and at least five distinct cards', () => {
    const { deck } = createGame()
    const start = { x: Integer(0), y: Integer(0) }
    const freshBoard = () => createTestBoard(
      createEmptyTileGrid(2, 2), { x: Integer(1), y: Integer(1), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) }, [start],
    )
    const placement = createTestPlacement(start, { direction: Direction.EAST, deck: new Deck(deck) })

    const composition = instructionsOf(deck)
    expect(createTestGame({ board: freshBoard(), players: [], deck: composition }).players).toEqual([])
    expect(() => createTestGame({ board: freshBoard(), players: [placement, placement], deck: composition })).toThrow(RangeError)
    expect(() => createTestGame({ board: freshBoard(), players: [placement], deck: composition.slice(0, 4) })).toThrow(RangeError)
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
    const { player, deck, game } = createGame()
    const validIds = deck.slice(0, 5).map((card) => card.id)

    game.pause()
    expect(game.submitProgram(player.id, validIds)._unsafeUnwrapErr()).toBe('GAME_PAUSED')
    expect(game.lastActivePhase).toBe('programming')
    expect(player.registers).toEqual([null, null, null, null, null])

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
  function createEmptyGame(width = 3, startTiles: Position[] = [{ x: Integer(1), y: Integer(0) }, { x: Integer(0), y: Integer(0) }]) {
    const board = createTestBoard(createEmptyTileGrid(width, 2), { x: Integer(width - 1), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) }, startTiles)
    const deck = [
      new Card('move-1', 'MOVE_1'),
      new Card('left-1', 'TURN_LEFT'),
      new Card('move-2', 'MOVE_1'),
      new Card('left-2', 'TURN_LEFT'),
      new Card('move-3', 'MOVE_1'),
    ]
    return { board, deck, game: createTestGame({ board, players: [], deck: instructionsOf(deck) }) }
  }

  it('creates and places a player with a private hand drawn from the deck', () => {
    const { deck, game } = createEmptyGame()

    const result = game.addPlayer('tank', 'red')

    expect(result.isOk()).toBe(true)
    const player = result._unsafeUnwrap()
    expect(game.players).toEqual([player])
    expect(player.robot.direction).toBe(Direction.NORTH)
    expect(game.getRobotPosition(player.robot.id)).toEqual({ x: 1, y: 0 })
    expect(player.hand).toHaveLength(deck.length)
    expect(player.hand.map((card) => card.instruction).sort()).toEqual(deck.map((card) => card.instruction).sort())
    expect(player.hand.map((card) => card.id)).not.toEqual(deck.map((card) => card.id))
  })

  it('gives each added player a hand with distinct card IDs', () => {
    const { game } = createEmptyGame()

    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')

    expect(second.hand.every((card) => !first.hand.some((other) => other.id === card.id))).toBe(true)
  })

  it('rejects adding a player when no spawn tile is free', () => {
    const { game } = createEmptyGame(2, [{ x: Integer(0), y: Integer(0) }])
    addTestPlayer(game, 'red')

    const result = game.addPlayer('tank', 'blue')

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
  })

  it('spawns players at successive declared start tiles and reports exhaustion once they are all occupied', () => {
    const { deck } = createGame()
    const board = createTestBoard(createEmptyTileGrid(3, 2), {
      x: Integer(1), y: Integer(0), angle: 0,
    }, { x: Integer(0), y: Integer(1) }, [{ x: Integer(2), y: Integer(0) }, { x: Integer(0), y: Integer(0) }])
    const game = createTestGame({ board, players: [], deck: instructionsOf(deck) })
    const first = addTestPlayer(game, 'red')
    const second = addTestPlayer(game, 'blue')

    expect(game.getRobotPosition(first.robot.id)).toEqual({ x: 2, y: 0 })
    expect(game.getRobotPosition(second.robot.id)).toEqual({ x: 0, y: 0 })
    expect(game.addPlayer('tank', 'green')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(game.players).toEqual([first, second])
  })

  it('stores the given name', () => {
    const { deck } = createGame()
    const named = createTestGame({
      board: createTestBoard(createEmptyTileGrid(2, 1), { x: Integer(0), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(1), y: Integer(0) }),
      players: [],
      deck: instructionsOf(deck),
      name: 'Shared game',
    })
    expect(named.name).toBe('Shared game')
  })
})

describe('Game roster validation and spawn skipping', () => {
  it('rejects a roster whose robot starts on a pit', () => {
    const { deck } = createGame()
    const board = createTestBoard([[new EmptyTile(), new PitTile(), new EmptyTile()]], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(0) })
    const pit = { x: Integer(1), y: Integer(0) }
    const placement = createTestPlacement(pit, { direction: Direction.EAST, deck: new Deck(deck) })

    expect(() => createTestGame({ board, players: [placement], deck: instructionsOf(deck) }))
      .toThrow('Robots cannot be placed on pits')
  })

  it('reports no safe spawn once the only declared start tile is occupied', () => {
    const { deck } = createGame()
    const board = createTestBoard([
      [new EmptyTile(), new PitTile(), new EmptyTile()],
      [new EmptyTile(), new EmptyTile(), new EmptyTile()],
    ], { x: Integer(2), y: Integer(0), angle: Math.PI / 2 }, { x: Integer(0), y: Integer(1) }, [{ x: Integer(0), y: Integer(0) }])
    const game = createTestGame({ board, players: [], deck: instructionsOf(deck) })
    const first = addTestPlayer(game, 'red')

    expect(game.getRobotPosition(first.robot.id)).toEqual({ x: 0, y: 0 })
    expect(first.hand).toHaveLength(deck.length)
    expect(first.hand.map((card) => card.instruction).sort()).toEqual(deck.map((card) => card.instruction).sort())
    expect(game.addPlayer('tank', 'blue')._unsafeUnwrapErr()).toBe('NO_SPAWN_AVAILABLE')
    expect(game.players).toEqual([first])
  })
})
