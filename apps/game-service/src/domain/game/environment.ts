import type { GearRotation } from '@robo-rally/game-events'
import type { Board } from '@/domain/game/Board'
import type { PlayerId, RobotId } from '@/domain/game/ids'
import type { Player } from '@/domain/game/Player'
import type { RobotPlacements } from '@/domain/game/RobotPlacements'
import { ConveyorTile, GearTile, type ConveyorLayout, type ConveyorSpeed } from '@/domain/game/Tile'
import { neighbour, rotateDirection, type Direction, type Position } from '@/domain/game/spatial'

type EnvironmentRobotState = Readonly<{
  robotId: RobotId
  position: Position
  direction: Direction
}>

type EnvironmentSnapshot = readonly (EnvironmentRobotState & Readonly<{
  playerId: PlayerId
  lastCheckpoint: number
  checkpointNumber?: number
  gearRotation?: GearRotation
}>)[]

export function captureEnvironmentSnapshot(
  board: Board,
  robotPlacements: RobotPlacements,
  players: readonly Player[],
): EnvironmentSnapshot {
  return players.map((player) => {
    const position = robotPlacements.positionOf(player.robot.id)
    const tile = board.getTile(position)
    return {
      robotId: player.robot.id,
      position,
      direction: player.robot.direction,
      playerId: player.id,
      lastCheckpoint: player.lastCheckpoint,
      checkpointNumber: tile?.checkpointNumber,
      gearRotation: tile instanceof GearTile ? tile.rotation : undefined,
    }
  })
}

// Turns are relative to the direction of travel into the destination.
const curvedEntries: Record<ConveyorLayout, readonly number[]> = {
  straight: [],
  'from-left': [1],
  'from-right': [3],
  'left-right': [1, 3],
  'straight-left': [1],
  'straight-right': [3],
  'three-way': [1, 3],
}

function conveyorPass(speed: ConveyorSpeed) {
  return (snapshot: EnvironmentSnapshot, board: Board, rebooted?: ReadonlySet<RobotId>) => {
    const candidates = snapshot.flatMap(({ robotId, position, direction }) => {
      const tile = board.getTile(position)
      if (rebooted?.has(robotId) || !(tile instanceof ConveyorTile) || tile.speed !== speed ||
          board.blocksMovementFrom(position, tile.direction)) return []

      const destination = neighbour(position, tile.direction)
      const target = board.getTile(destination)
      const turn = target instanceof ConveyorTile
        ? curvedEntries[target.layout].find((turn) => rotateDirection(tile.direction, turn) === target.direction)
        : undefined
      const occupant = snapshot.find((robot) => samePosition(robot.position, destination))?.robotId
      return [{ robotId, position: destination, direction: rotateDirection(direction, turn ?? 0), occupant }]
    })

    const moves = new Map(candidates
      .filter((move) => !candidates.some((other) => other.robotId !== move.robotId &&
        (samePosition(move.position, other.position) ||
          (other.robotId === move.occupant && other.occupant === move.robotId))))
      .map((move) => [move.robotId, move] as const))

    // Removing a blocked move can block the robot behind it.
    let changed: boolean
    do {
      changed = false
      for (const [robotId, { occupant }] of moves) {
        if (occupant !== undefined && !moves.has(occupant)) {
          moves.delete(robotId)
          changed = true
        }
      }
    } while (changed)

    return {
      kind: 'CONVEYORS' as const,
      robots: Array.from(moves.values(), ({ robotId, position, direction }) => ({ robotId, position, direction })),
    }
  }
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

export function calculateGears(snapshot: EnvironmentSnapshot) {
  return {
    kind: 'GEARS' as const,
    robots: snapshot.flatMap(({ robotId, position, direction, gearRotation }) =>
      gearRotation === undefined ? [] : [{
        robotId, position,
        direction: rotateDirection(direction, gearRotation === 'COUNTERCLOCKWISE' ? 1 : 3),
      }]),
  }
}

export function calculateCheckpoints(snapshot: EnvironmentSnapshot) {
  return {
    kind: 'CHECKPOINTS' as const,
    checkpointProgress: snapshot.flatMap(({ playerId, lastCheckpoint, checkpointNumber }) =>
      checkpointNumber === lastCheckpoint + 1 ? [{ playerId, lastCheckpoint: checkpointNumber }] : []),
  }
}

// 2016 Game Guide, p. 8: blue belts, green belts, push panels, gears,
// board lasers, robot lasers, energy, checkpoints. Run only implemented steps.
const blueConveyors = conveyorPass(2)
export const environmentSteps = [blueConveyors, blueConveyors, conveyorPass(1), calculateGears, calculateCheckpoints] as const
export type EnvironmentChanges = ReturnType<(typeof environmentSteps)[number]>
