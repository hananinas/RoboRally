import { useMemo, type CSSProperties } from 'react'
import laser1Url from '../board/assets/laser1.svg'
import laser2Url from '../board/assets/laser2.svg'
import laser3Url from '../board/assets/laser3.svg'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
} from '../board/boardConfig.ts'
import { createBoardScene, type BoardScenePiece } from '../board/boardScene.ts'
import type { BoardRenderModel } from '../board/boardModel.ts'
import '../board/BoardViewport.css'

type BoardViewportProps = Readonly<{
  board: BoardRenderModel
}>

type PieceStyle = CSSProperties &
  Readonly<{
    '--board-piece-scale'?: number
    '--board-piece-x'?: string
    '--board-piece-y'?: string
  }>

const ASSET_URLS = {
  laser1: laser1Url,
  laser2: laser2Url,
  laser3: laser3Url,
} as const

function holeColour(blend: number): string {
  const percentage = Math.min(1, Math.max(0, blend)) * 100
  return `color-mix(in srgb, var(--board-background) ${100 - percentage}%, var(--board-hole-bottom) ${percentage}%)`
}

function pieceStyle(piece: BoardScenePiece): PieceStyle {
  return {
    left: piece.tileCentre.worldX,
    top: piece.tileCentre.worldY,
    width: BOARD_CONFIG.tile * piece.component.width,
    zIndex: piece.slice.order ?? 0,
  }
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
    'data-board-recipe': piece.cell.recipe,
    'data-board-tile': `${piece.cell.x},${piece.cell.y}`,
    style: pieceStyle(piece),
  }

  return piece.component.asset ? (
    <img
      {...sharedProps}
      alt=""
      draggable={false}
      src={ASSET_URLS[piece.component.asset]}
    />
  ) : (
    <div {...sharedProps} />
  )
}

function BoardViewport({ board }: BoardViewportProps) {
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

  return (
    <main className="board-viewport" aria-label="Game board">
      <div
        className="board-canvas"
        data-board-columns={board.columns}
        data-board-rows={board.rows}
      >
        {scene.planes.map((pieces, layer) => (
          <div
            className="board-plane"
            data-board-layer={layer}
            key={layer}
            style={{ zIndex: layer }}
          >
            {pieces.map((piece) => (
              <BoardPiece key={piece.key} piece={piece} />
            ))}
            {layer === 0 &&
              scene.holes.map((hole) => (
                <div
                  className="board-piece board-piece--hole"
                  data-board-height="0"
                  data-board-recipe="hole"
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
                      key={index}
                      style={{ background: holeColour(depth.blend) }}
                    />
                  ))}
                </div>
              ))}
          </div>
        ))}
      </div>
    </main>
  )
}

export default BoardViewport
