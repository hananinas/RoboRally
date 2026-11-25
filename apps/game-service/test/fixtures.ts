import { randomUUID } from 'node:crypto'
import type { Instruction } from '@robo-rally/game-events'
import type { Card } from '@/game/Card'
import { Deck, createDeckCards } from '@/game/Deck'
import { Game } from '@/game/Game'
import type { Board } from '@/game/Board'
import { Player } from '@/game/Player'
import { Robot, ROBOT_COLOURS } from '@/game/Robot'
import { Direction, type Position } from '@/game/spatial'
import { EmptyTile, RebootTile, type Tile } from '@/game/Tile'

type RobotOverrides = Partial<{
  id: string
  direction: Direction
  colour: string
}>

export function createTestRobot(overrides: RobotOverrides = {}): Robot {
  return new Robot(
    overrides.id ?? randomUUID(),
    overrides.direction ?? Direction.NORTH,
    overrides.colour ?? ROBOT_COLOURS[0],
  )
}

export function createTestPlayer(overrides: Partial<{
  id: string
  robot: Robot
  deck: Deck
}> = {}): Player {
  return new Player(
    overrides.id ?? randomUUID(),
    overrides.robot ?? createTestRobot(),
    overrides.deck ?? new Deck([]),
  )
}

export function createTestGame(options: {
  board: Board
  players?: readonly Player[]
  deck?: readonly Card[]
  name?: string
}): Game {
  return new Game({
    board: options.board,
    players: options.players ?? [],
    deck: options.deck ?? createDeckCards(),
    name: options.name ?? 'Test game',
  })
}

export function placeTestPlayer(
  board: Board,
  position: Position,
  overrides: RobotOverrides & Partial<{ deck: Deck }> = {},
): Player {
  const robot = createTestRobot(overrides)
  board.placeRobot(robot.id, position)
  return createTestPlayer({ robot, deck: overrides.deck })
}

export function addTestPlayer(game: Game, colour?: string): Player {
  return game.addPlayer(colour ?? ROBOT_COLOURS[game.players.length % ROBOT_COLOURS.length])._unsafeUnwrap()
}

export function createEmptyTileGrid(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => new EmptyTile()))
}

// Copies the grid with a RebootTile at each position, keeping that tile's walls and checkpoint.
export function withRebootTiles(tiles: readonly (readonly Tile[])[], ...positions: Position[]): Tile[][] {
  const grid = tiles.map((row) => [...row])
  for (const { x, y } of positions) {
    const tile = grid[y]?.[x]
    if (tile?.kind !== 'EMPTY') throw new RangeError(`Reboot tile at ${x},${y} must replace an empty tile`)
    grid[y][x] = new RebootTile(tile.walls, tile.checkpointNumber)
  }
  return grid
}

export function programLeadingWith(cards: readonly Card[], instruction: Instruction): Card[] {
  const card = cards.find((candidate) => candidate.instruction === instruction)!
  return [card, ...cards.filter((candidate) => candidate !== card).slice(0, 4)]
}
