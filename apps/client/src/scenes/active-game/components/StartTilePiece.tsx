import type { CSSProperties } from 'react'
import { BOARD_CONFIG } from '../board/boardConfig.ts'
import type { BoardRenderModel } from '../board/boardModel.ts'
import { tileCentre } from '../board/boardMath.ts'
import type { DisplayRobot } from '../board/robotPlayback.ts'

// Drawn on the tile surface, so robots standing on it cover the marker.
const SURFACE_LAYER = 3

export default function StartTilePiece({ board, robot }: Readonly<{
  board: BoardRenderModel
  robot: DisplayRobot
}>) {
  const { x, y } = robot.startPosition
  const centre = tileCentre(robot.startPosition, board, BOARD_CONFIG)
  const height = SURFACE_LAYER / BOARD_CONFIG.parallaxReferenceLayer

  return (
    <div
      className="board-piece board-piece--start-tile"
      role="img"
      aria-label="Starting tile"
      data-board-start-tile={robot.robotId}
      data-board-tile={`${x},${y}`}
      data-board-height={height}
      style={{
        left: centre.worldX,
        top: centre.worldY,
        width: BOARD_CONFIG.tile * 0.86,
        height: BOARD_CONFIG.tile * 0.86,
        '--start-tile-colour': robot.colour,
      } as CSSProperties}
    />
  )
}