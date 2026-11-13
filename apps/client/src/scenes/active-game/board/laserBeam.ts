import type { LaserStrength, Orientation } from '@robo-rally/game-events'
import type {
  BoardCell,
  BoardPoint,
  BoardRenderConfig,
  BoardRenderModel,
  BoardWallSide,
} from './boardModel.ts'

export type LaserBeamEnd = 'wall' | 'target' | 'edge'

export type LaserBeam = TracedBeam & Readonly<{ strength: LaserStrength }>

type TracedBeam = BoardPoint &
  Readonly<{
    orientation: Orientation
    // How many cells the beam crosses beyond the laser's own cell
    cells: number
    end: LaserBeamEnd
  }>

type Step = Readonly<{
  dx: number
  dy: number
  side: BoardWallSide
  opposite: BoardWallSide
  // Mount and beam artwork face east; this rotates it to face the orientation
  angle: number
}>

const STEPS: Readonly<Record<Orientation, Step>> = {
  NORTH: { dx: 0, dy: -1, side: 'north', opposite: 'south', angle: -90 },
  EAST: { dx: 1, dy: 0, side: 'east', opposite: 'west', angle: 0 },
  SOUTH: { dx: 0, dy: 1, side: 'south', opposite: 'north', angle: 90 },
  WEST: { dx: -1, dy: 0, side: 'west', opposite: 'east', angle: 180 },
}

export function laserAngle(orientation: Orientation): number {
  return STEPS[orientation].angle
}

// The beam leaves the laser's cell and stops at the first blocker, a robot or
// the priority antenna (reaching its centre), the first wall on either side of a cell boundary (reaching the cell
// edge), or the edge of the board.
export function traceBeam(
  board: Pick<BoardRenderModel, 'columns' | 'rows' | 'cells'>,
  laser: BoardPoint & Readonly<{ orientation: Orientation }>,
  blockers: readonly BoardPoint[],
): TracedBeam {
  const { dx, dy, side, opposite } = STEPS[laser.orientation]
  const occupied = new Set(blockers.map(({ x, y }) => `${x},${y}`))
  const cellAt = (x: number, y: number): BoardCell =>
    board.cells[y * board.columns + x]
  const beam = { x: laser.x, y: laser.y, orientation: laser.orientation }

  let x = laser.x
  let y = laser.y
  for (let cells = 0; ; cells += 1) {
    if (occupied.has(`${x},${y}`)) return { ...beam, cells, end: 'target' }
    if (cellAt(x, y).walls[side]) return { ...beam, cells, end: 'wall' }

    const nextX = x + dx
    const nextY = y + dy
    if (nextX < 0 || nextX >= board.columns || nextY < 0 || nextY >= board.rows) {
      return { ...beam, cells, end: 'edge' }
    }
    if (cellAt(nextX, nextY).walls[opposite]) {
      return { ...beam, cells, end: 'wall' }
    }
    x = nextX
    y = nextY
  }
}

export function traceBeams(
  board: BoardRenderModel,
  robots: readonly BoardPoint[],
): readonly LaserBeam[] {
  const blockers = board.antenna ? [...robots, board.antenna] : robots
  return board.cells.flatMap((cell) =>
    cell.laserOrientation && cell.laserStrength
      ? [{
          ...traceBeam(board, { x: cell.x, y: cell.y, orientation: cell.laserOrientation }, blockers),
          strength: cell.laserStrength,
        }]
      : [],
  )
}

// Distance in pixels from the centre of the laser's cell to the end of the beam
export function beamReach(
  beam: TracedBeam,
  config: Pick<BoardRenderConfig, 'gap' | 'tile'>,
): number {
  const centre = beam.cells * (config.tile + config.gap)
  return beam.end === 'target' ? centre : centre + config.tile / 2
}
