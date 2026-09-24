import { describe, expect, it } from 'vitest'
import { Board, Direction, EmptyTile, Game, Move1, Player, Robot } from './index.js'

function setup() {
  const board = new Board(Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => new EmptyTile())))
  const deck = Array.from({ length: 5 }, (_, index) => new Move1(`move-${index}`))
  const game = new Game(board, [], deck)
  const add = (id: string, x: number) => {
    const player = new Player(id, new Robot(`robot-${id}`, Direction.NORTH))
    game.addPlayer(player, { x, y: 4 })
    return player
  }
  return { board, deck, game, add }
}

describe('membership during rounds', () => {
  it('counts programming joiners and starts activation when an unsubmitted player leaves', () => {
    const { game, board, deck, add } = setup()
    const a = add('a', 2)
    const b = add('b', 1)
    game.submitProgram(a.id, deck)
    const c = add('c', 0)
    game.removePlayer(b.id)
    expect(game.phase).toBe('programming')
    expect(board.occupantAt({ x: 1, y: 4 })).toBeUndefined()
    game.submitProgram(c.id, deck)
    expect(game.phase).toBe('activation')
  })

  it('keeps activation joiners on the board but out of the current action roster', () => {
    const { game, deck, add } = setup()
    const a = add('a', 2)
    game.submitProgram(a.id, deck)
    game.executeNextAction()
    const b = add('b', 1)
    expect(b.hand).toEqual([])
    expect(game.participatesInRound(b.id)).toBe(false)
    for (let register = 1; register < 5; register++) {
      expect(game.executeNextAction().action.robotId).toBe(a.robot.id)
    }
    expect(game.roundNumber).toBe(2)
    expect(b.hand).toEqual(deck)
    game.submitProgram(a.id, deck)
    expect(game.phase).toBe('programming')
    game.submitProgram(b.id, deck)
    expect(game.phase).toBe('activation')
  })

  it('skips a departed robot and advances a partially completed register', () => {
    const { game, deck, add } = setup()
    const a = add('a', 2)
    const b = add('b', 1)
    game.submitProgram(a.id, deck)
    game.submitProgram(b.id, deck)
    expect(game.executeNextAction().action.robotId).toBe(a.robot.id)
    game.removePlayer(b.id)
    expect(game.currentRegister).toBe(1)
    for (let register = 1; register < 5; register++) {
      expect(game.executeNextAction().registerIndex).toBe(register)
    }
    expect(game.roundNumber).toBe(2)
  })

  it('ends activation when all eligible players leave and deals waiting newcomers', () => {
    const { game, deck, add } = setup()
    const a = add('a', 2)
    game.submitProgram(a.id, deck)
    const b = add('b', 1)
    game.removePlayer(a.id)
    expect(game.phase).toBe('programming')
    expect(game.roundNumber).toBe(2)
    expect(b.hand).toEqual(deck)
    game.removePlayer(b.id)
    game.recheckProgrammingPhase()
    expect(game.players).toEqual([])
    expect(game.phase).toBe('programming')
    expect(game.roundNumber).toBe(2)
  })
})
