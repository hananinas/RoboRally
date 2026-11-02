import { useMemo, useRef, type CSSProperties } from 'react'
import antennaSprites from '../board/assets/antenna.hbls?raw'
import gearSprites from '../board/assets/gears.hbls?raw'
import laserSprites from '../board/assets/lasers.hbls?raw'
import tankSprites from '../board/assets/tanks.hbls?raw'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from '../board/boardConfig.ts'
import { tileCentre } from '../board/boardMath.ts'
import {
  ROBOT_MOVE_DURATION_MS,
  ROBOT_TURN_DURATION_MS,
  type DisplayRobot,
} from '../board/robotPlayback.ts'
import { createBoardScene, type BoardScenePiece } from '../board/boardScene.ts'
import type {
  BoardRenderModel,
  BoardTileWalls,
  BoardWallSide,
} from '../board/boardModel.ts'
import useBoardInteraction from '../board/useBoardInteraction.ts'
import CheckpointPiece from './CheckpointPiece.tsx'
import '../board/BoardViewport.css'

type BoardViewportProps = Readonly<{
  board: BoardRenderModel
  robots: readonly DisplayRobot[]
}>

type PieceStyle = CSSProperties &
  Readonly<{
    '--board-piece-scale'?: number
    '--board-piece-angle'?: string
    '--board-piece-x'?: string
    '--board-piece-y'?: string
    '--tank-colour'?: string
    '--tank-move-duration'?: string
    '--tank-turn-duration'?: string
  }>

function holeColour(blend: number): string {
  const percentage = Math.min(1, Math.max(0, blend)) * 100
  return `color-mix(in srgb, var(--board-background) ${100 - percentage}%, var(--board-hole-bottom) ${percentage}%)`
}

function wallJoins(
  side: BoardWallSide,
  walls: BoardTileWalls,
): readonly [boolean, boolean] {
  return side === 'north' || side === 'south'
    ? [walls.west, walls.east]
    : [walls.north, walls.south]
}

function pieceStyle(piece: BoardScenePiece): PieceStyle {
  const style: PieceStyle = {
    left: piece.tileCentre.worldX,
    top: piece.tileCentre.worldY,
    width: BOARD_CONFIG.tile * piece.component.width,
    zIndex: piece.slice.order ?? 0,
    '--board-piece-angle': piece.angle === undefined ? undefined : `${piece.angle}deg`,
  }

  if (!piece.slice.wall) return style

  const horizontal =
    piece.slice.wall === 'north' || piece.slice.wall === 'south'
  const pitch = BOARD_CONFIG.tile + BOARD_CONFIG.gap
  const extension = (BOARD_CONFIG.gap + BOARD_CONFIG.edgeWall.width) / 2
  const [joinsStart, joinsEnd] = wallJoins(
    piece.slice.wall,
    piece.cell.walls,
  )
  const length =
    BOARD_CONFIG.tile +
    (Number(joinsStart) + Number(joinsEnd)) * extension
  const shift = (Number(joinsEnd) - Number(joinsStart)) * extension / 2
  const offset = pitch / 2
  style.width = horizontal ? length : BOARD_CONFIG.edgeWall.width
  style.height = horizontal ? BOARD_CONFIG.edgeWall.width : length
  style.borderRadius = BOARD_CONFIG.edgeWall.cornerRadius
  if (horizontal) style.left = piece.tileCentre.worldX + shift
  else style.top = piece.tileCentre.worldY + shift
  if (piece.slice.wall === 'north') style.top = piece.tileCentre.worldY - offset
  if (piece.slice.wall === 'east') style.left = piece.tileCentre.worldX + offset
  if (piece.slice.wall === 'south') style.top = piece.tileCentre.worldY + offset
  if (piece.slice.wall === 'west') style.left = piece.tileCentre.worldX - offset
  return style
}

function BoardPiece({ piece }: Readonly<{ piece: BoardScenePiece }>) {
  const className = [
    'board-piece',
    piece.component.className,
    piece.slice.shadow && 'board-piece--shadow',
  ]
    .filter(Boolean)
    .join(' ')
  const sharedProps = {
    className,
    'data-board-component': piece.componentName,
    'data-board-height': piece.height,
    'data-board-lift-height': piece.liftHeight,
    'data-board-tile-type': piece.cell.tile,
    'data-board-tile': `${piece.cell.x},${piece.cell.y}`,
    'data-board-wall': piece.slice.wall,
    style: pieceStyle(piece),
  }

  if (piece.component.asset) {
    const { symbol, viewBox } = piece.component.asset
    return (
      <svg
        {...sharedProps}
        aria-hidden={piece.component.label ? undefined : true}
        role={piece.component.label ? 'img' : undefined}
        aria-label={piece.component.label}
        preserveAspectRatio="xMidYMid meet"
        viewBox={viewBox}
      >
        <use href={`#${symbol}`} />
      </svg>
    )
  }

  return (
    <div
      {...sharedProps}
    />
  )
}

const ROBOT_COMPONENTS = [
  'testTank1',
  'testTank2',
  'testTank3',
  'testTank4',
  'testTank5',
  'testTank6',
  'testTank7',
  'testTank8',
] as const

function RobotPiece({
  board,
  componentName,
  layer,
  robot,
}: Readonly<{
  board: BoardRenderModel
  componentName: (typeof ROBOT_COMPONENTS)[number]
  layer: number
  robot: DisplayRobot
}>) {
  const component = BOARD_COMPONENTS[componentName]
  if (!component.asset) throw new Error(`Missing robot sprite ${componentName}`)
  const centre = tileCentre(robot.position.coordinate, board, BOARD_CONFIG)
  const height = layer / BOARD_CONFIG.parallaxReferenceLayer
  const style: PieceStyle = {
    left: centre.worldX,
    top: centre.worldY,
    width: BOARD_CONFIG.tile * component.width,
    zIndex: layer === 3 ? 1 : 0,
    '--board-piece-angle': `${robot.angle}deg`,
    '--tank-colour': robot.colour,
  }

  return (
    <svg
      aria-hidden="true"
      className={`board-piece ${component.className} board-piece--test-tank`}
      data-board-component={componentName}
      data-board-height={height}
      data-board-lift-height={Math.min(
        height,
        3 / BOARD_CONFIG.parallaxReferenceLayer,
      )}
      data-board-tile={`${robot.position.coordinate.x},${robot.position.coordinate.y}`}
      data-robot-id={robot.robotId}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      viewBox={component.asset.viewBox}
    >
      <use href={`#${component.asset.symbol}`} />
    </svg>
  )
}

function BoardViewport({ board, robots }: BoardViewportProps) {
  const viewportRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const scene = useMemo(
    () =>
      createBoardScene(
        board,
        BOARD_CONFIG,
        BOARD_COMPONENTS,
        BOARD_RECIPES,
      ),
    [board],
  )
  useBoardInteraction({ canvasRef, robots, scene, viewportRef })
  const checkpointTiles = scene.tiles.filter((tile) => tile.cell.checkpointNumber !== undefined)

  return (
    <main
      ref={viewportRef}
      className="board-viewport"
      aria-label="Game board"
      style={{
        '--tank-move-duration': `${ROBOT_MOVE_DURATION_MS}ms`,
        '--tank-turn-duration': `${ROBOT_TURN_DURATION_MS}ms`,
      } as PieceStyle}
    >
      <div
        ref={canvasRef}
        className="board-canvas"
        data-board-columns={board.columns}
        data-board-rows={board.rows}
      >
        <div
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: `${antennaSprites}${gearSprites}${laserSprites}${tankSprites}` }}
        />
        {scene.planes.map((pieces, layer) => {
          const robotComponent = ROBOT_COMPONENTS[layer - 3]
          return (
            <div
              className="board-plane"
              data-board-layer={layer}
              key={layer}
              style={{ zIndex: layer }}
            >
              {pieces.map((piece) => (
                <BoardPiece key={piece.key} piece={piece} />
              ))}
              {checkpointTiles.map((tile) => (
                <CheckpointPiece key={`${tile.cell.x},${tile.cell.y}`} tile={tile} layer={layer} />
              ))}
              {robotComponent && robots.map((robot) => (
                <RobotPiece
                  board={board}
                  componentName={robotComponent}
                  key={`${robot.robotId}:${robotComponent}`}
                  layer={layer}
                  robot={robot}
                />
              ))}
              {layer === 0 &&
                scene.holes.map((hole) => (
                  <div
                    className="board-piece board-piece--hole"
                    data-board-height="0"
                    data-board-tile-type="hole"
                    data-board-tile={`${hole.cell.x},${hole.cell.y}`}
                    key={hole.key}
                    style={{
                      background: holeColour(BOARD_CONFIG.hole.colourOffset),
                      left: hole.tileCentre.worldX,
                      top: hole.tileCentre.worldY,
                      width: BOARD_CONFIG.tile,
                      zIndex: 1,
                    }}
                  >
                    {hole.depths.map((depth, index) => (
                      <div
                        className="board-hole-depth"
                        data-board-height={depth.height}
                        data-board-tile={`${hole.cell.x},${hole.cell.y}`}
                        key={index}
                        style={{ background: holeColour(depth.blend) }}
                      />
                    ))}
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </main>
  )
}

export default BoardViewport
