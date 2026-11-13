import { describe, expect, it } from 'vitest'
import { Board, Card, Direction, EmptyTile, Game, LaserTile, Player, Robot, type Tile } from '@/game/index'
import { Integer } from '@/numbers'

function createGame({ lasers }: { lasers: boolean }) {
  const tiles: Tile[][] = Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => new EmptyTile()))
  if (lasers) tiles[2][4] = new LaserTile(Direction.WEST, 3)
  const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 })
  const players = [0, 1].map((index) => {
    const robot = new Robot(`robot-${index}`, Direction.EAST)
    board.placeRobot(robot.id, { x: Integer(index), y: Integer(1) })
    return new Player(`player-${index}`, robot)
  })
  const cards = ['a', 'b', 'c', 'd', 'e'].map((id) => new Card(id, 'TURN_LEFT'))
  for (const player of players) player.deck.add(cards)
  const game = new Game({ board, players, deck: cards, rebootTile: { x: Integer(0), y: Integer(2) }, random: () => 0 })
  for (const player of players) game.submitProgram(player.id, cards.map((card) => card.id))
  return { players, game }
}

function actAll(game: Game) {
  game.executeNextAction()
  return game.executeNextAction()
}

describe('board element activation', () => {
  it('holds the register open once every robot has acted', () => {
    const { game } = createGame({ lasers: true })

    expect(game.executeNextAction().roundConcluded).toBe(false)
    expect(game.boardElementsPending).toBe(false)
    game.executeNextAction()

    expect(game.boardElementsPending).toBe(true)
    expect(game.currentRegister).toBe(0)
    expect(game.requirePhase('activation').isOk()).toBe(true)
    expect(() => game.executeNextAction()).toThrow()
  })

  it('concludes the register with the last element', () => {
    const { game } = createGame({ lasers: true })
    actAll(game)

    expect(game.activateNextBoardElement()).toEqual({ registerIndex: 0, element: 'LASERS', roundConcluded: false })
    expect(game.boardElementsPending).toBe(false)
    expect(game.currentRegister).toBe(1)
  })

  it('activates in every register and then deals a new round', () => {
    const { game } = createGame({ lasers: true })
    const results = Array.from({ length: 5 }, () => {
      actAll(game)
      return game.activateNextBoardElement()
    })

    expect(results.map(({ registerIndex }) => registerIndex)).toEqual([0, 1, 2, 3, 4])
    expect(results.map(({ roundConcluded }) => roundConcluded)).toEqual([false, false, false, false, true])
    expect(game.requirePhase('programming').isOk()).toBe(true)
  })

  it('cannot activate when none are pending', () => {
    const { game } = createGame({ lasers: true })
    expect(() => game.activateNextBoardElement()).toThrow()
  })

  it('stays pending across pausing', () => {
    const { game } = createGame({ lasers: true })
    actAll(game)
    game.pause()
    expect(() => game.activateNextBoardElement()).toThrow()
    game.resume()

    expect(game.boardElementsPending).toBe(true)
    expect(game.activateNextBoardElement().element).toBe('LASERS')
  })

  it('skips elements the board does not have', () => {
    const { game } = createGame({ lasers: false })
    actAll(game)

    expect(game.boardElementsPending).toBe(false)
    expect(game.currentRegister).toBe(1)
  })

  it('ends the round when the last player leaves while elements are pending', () => {
    const { players, game } = createGame({ lasers: true })
    actAll(game)

    game.removePlayer(players[0].id)
    expect(game.boardElementsPending).toBe(true)
    expect(game.removePlayer(players[1].id)).toEqual({ roundConcluded: true })
    expect(game.boardElementsPending).toBe(false)
    expect(game.requirePhase('programming').isOk()).toBe(true)
  })
})
