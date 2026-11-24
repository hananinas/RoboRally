import { randomUUID } from 'node:crypto'
import type { Instruction } from '@robo-rally/game-events'
import type { Card } from '@/domain/game/Card'
import { Deck, createDeckCards } from '@/domain/game/Deck'
import { Game, type PlayerPlacement } from '@/domain/game/Game'
import { Board, type Antenna } from '@/domain/game/Board'
import { Player } from '@/domain/game/Player'
import { Robot, ROBOT_COLOURS } from '@/domain/game/Robot'
import { Direction, type Position } from '@/domain/game/spatial'
import { EmptyTile, RebootTile, StartTile, type Tile } from '@/domain/game/Tile'

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
    'tank',
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
  players?: readonly PlayerPlacement[]
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

export function createTestPlacement(
  position: Position,
  overrides: RobotOverrides & Partial<{ deck: Deck }> = {},
): PlayerPlacement {
  const robot = createTestRobot(overrides)
  return { player: createTestPlayer({ robot, deck: overrides.deck }), position }
}

export function addTestPlayer(game: Game, colour?: string): Player {
  return game.addPlayer('tank', colour)._unsafeUnwrap()
}

export function createEmptyTileGrid(width: number, height: number): Tile[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => new EmptyTile()))
}

export function gridWithRebootTiles(tiles: readonly (readonly Tile[])[], ...positions: Position[]): Tile[][] {
  const grid = tiles.map((row) => [...row])
  for (const { x, y } of positions) {
    grid[y][x] = new RebootTile(grid[y][x].walls)
  }
  return grid
}

export function gridWithStartTiles(tiles: readonly (readonly Tile[])[], ...positions: readonly Position[]): Tile[][] {
  const grid = tiles.map((row) => [...row])
  positions.forEach(({ x, y }, index) => {
    grid[y][x] = new StartTile(index + 1, grid[y][x].walls)
  })
  return grid
}

export function createTestBoard(
  tiles: readonly (readonly Tile[])[],
  antenna: Antenna,
  rebootTiles: Position | readonly Position[],
  startTiles: readonly Position[] = [],
): Board {
  const reboots = [rebootTiles].flat()
  return new Board(gridWithStartTiles(gridWithRebootTiles(tiles, ...reboots), ...startTiles), antenna)
}

export function programLeadingWith(cards: readonly Card[], instruction: Instruction): Card[] {
  const card = cards.find((candidate) => candidate.instruction === instruction)!
  return [card, ...cards.filter((candidate) => candidate !== card).slice(0, 4)]
}
