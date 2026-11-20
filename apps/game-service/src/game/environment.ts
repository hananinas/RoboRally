import type { GearRotation } from '@robo-rally/game-events'
import type { Board } from '@/game/Board'
import type { PlayerId, RobotId } from '@/game/ids'
import type { Player } from '@/game/Player'
import { GearTile } from '@/game/Tile'
import { rotateDirection, type Direction, type Position } from '@/game/spatial'

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

export function captureEnvironmentSnapshot(board: Board, players: readonly Player[]): EnvironmentSnapshot {
  return players.map((player) => {
    const position = board.positionOf(player.robot.id)
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

// Lasers only light up for now; the client draws the beams from the board state.
export function calculateLasers() {
  return { kind: 'LASERS' as const }
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
export const environmentSteps = [calculateGears, calculateLasers, calculateCheckpoints] as const

// Boards without lasers skip the laser step.
export function environmentStepsFor(board: Board): readonly (typeof environmentSteps)[number][] {
  return board.hasLasers ? environmentSteps : environmentSteps.filter((step) => step !== calculateLasers)
}

export type EnvironmentChanges = ReturnType<(typeof environmentSteps)[number]>
