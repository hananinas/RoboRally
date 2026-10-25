import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, Player, Robot } from '@/game/index'
import { Integer } from '@/numbers'

function createGame(starts = [{ x: 0, y: 1, direction: Direction.EAST }]) {
  const tiles = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  tiles[1][1] = new EmptyTile([], 1)
  tiles[1][3] = new EmptyTile([], 2)
  const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 })
  const players = starts.map(({ x, y, direction }, index) => {
    const robot = new Robot(`robot-${index}`, direction)
    board.placeRobot(robot.id, { x: Integer(x), y: Integer(y) })
    return new Player(`player-${index}`, robot)
  })
  const cards = {
    step: new Card('step', 'MOVE_1'),
    stepAgain: new Card('step-again', 'MOVE_1'),
    move2: new Card('move-2', 'MOVE_2'),
    back: new Card('back', 'BACK_UP'),
    left: new Card('left', 'TURN_LEFT'),
    right: new Card('right', 'TURN_RIGHT'),
    uturn: new Card('uturn', 'U_TURN'),
  }
  const game = new Game(board, players, Object.values(cards), undefined, { x: Integer(0), y: Integer(2) })
  return { board, players, cards, game }
}

describe('checkpoint activation', () => {
  it('checks final positions after every robot has acted in the register', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 4, y: 2, direction: Direction.NORTH },
    ])
    for (const player of players) game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))

    expect(game.executeNextAction().action.robotId).toBe(players[0].robot.id)
    expect(players[0].lastCheckpoint).toBe(0)
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    expect(game.currentRegister).toBe(1)
  })

  it('ignores passed checkpoints, completes the course in order and continues into another round', () => {
    const { board, players: [player], cards: c, game } = createGame()
    const program = [c.move2, c.back, c.step, c.stepAgain, c.left]
    game.submitProgram(player.id, program.map((card) => card.id))
    const progress = program.map(() => {
      game.executeNextAction()
      return player.lastCheckpoint
    })

    expect(progress).toEqual([0, 1, 1, 2, 2])
    expect(board.getTile({ x: Integer(1), y: Integer(1) })?.checkpointNumber).toBe(1)
    expect(board.getTile({ x: Integer(3), y: Integer(1) })?.checkpointNumber).toBe(2)
    expect(game.phase).toBe('programming')
    game.submitProgram(player.id, program.map((card) => card.id))
    expect(game.phase).toBe('activation')
    game.executeNextAction()
    expect(player.lastCheckpoint).toBe(2)
  })

  it('does not award a later checkpoint before the next required checkpoint', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 2, y: 1, direction: Direction.EAST }])
    game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))
    for (let register = 0; register < 4; register++) {
      game.executeNextAction()
      expect(player.lastCheckpoint).toBe(0)
    }
  })

  it('awards a checkpoint under a stationary robot after a turn, irrespective of facing', () => {
    const { players: [player], cards: c, game } = createGame([{ x: 1, y: 1, direction: Direction.EAST }])
    expect(player.lastCheckpoint).toBe(0)
    game.submitProgram(player.id, [c.left, c.right, c.uturn, c.step, c.back].map((card) => card.id))
    expect(player.lastCheckpoint).toBe(0)
    for (let register = 0; register < 3; register++) {
      game.executeNextAction()
      expect(player.lastCheckpoint).toBe(1)
    }
  })

  it('keeps progress independent when players visit the same permanent checkpoint', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 1, y: 2, direction: Direction.NORTH },
    ])
    game.submitProgram(players[0].id, [c.step, c.stepAgain, c.left, c.right, c.uturn].map((card) => card.id))
    game.submitProgram(players[1].id, [c.left, c.right, c.step, c.stepAgain, c.uturn].map((card) => card.id))
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    game.executeNextAction()
    game.executeNextAction()
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 1])
  })

  it('checks the remaining robots when a departure completes the register', () => {
    const { players, cards: c, game } = createGame([
      { x: 0, y: 1, direction: Direction.EAST },
      { x: 4, y: 2, direction: Direction.NORTH },
    ])
    for (const player of players) game.submitProgram(player.id, [c.step, c.left, c.right, c.uturn, c.back].map((card) => card.id))
    game.executeNextAction()
    expect(players[0].lastCheckpoint).toBe(0)
    game.removePlayer(players[1].id)
    expect(players.map((player) => player.lastCheckpoint)).toEqual([1, 0])
    expect(game.currentRegister).toBe(1)
  })
})
