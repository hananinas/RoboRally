import type { CSSProperties } from 'react'
import {
  BOARD_COMPONENTS,
  BOARD_CONFIG,
  BOARD_RECIPES,
  LASER_BEAM,
} from '../board/boardConfig.ts'
import { tileCentre } from '../board/boardMath.ts'
import type { BoardRenderModel } from '../board/boardModel.ts'
import { beamReach, laserAngle, type LaserBeam } from '../board/laserBeam.ts'

type PieceStyle = CSSProperties & Readonly<{ '--board-piece-angle': string }>

export default function LaserBeamPiece({ board, beam }: Readonly<{
  board: Pick<BoardRenderModel, 'columns' | 'rows'>
  beam: LaserBeam
}>) {
  const { size, startX, thickness, centres, glowBlur, glowInset } = LASER_BEAM
  const centre = tileCentre(beam, board, BOARD_CONFIG)
  const width = BOARD_CONFIG.tile * BOARD_COMPONENTS.laser1.width
  const endX = size / 2 + beamReach(beam, BOARD_CONFIG) / (width / size)
  const height = LASER_BEAM.layer / BOARD_CONFIG.parallaxReferenceLayer
  // Lift with the laser's own stack, while retaining the beam's parallax
  const liftHeight = Math.min(
    height,
    (BOARD_RECIPES.laser.stackBaseLayer ?? LASER_BEAM.layer) /
      BOARD_CONFIG.parallaxReferenceLayer,
  )
  const id = `laser-beam-${beam.x}-${beam.y}`
  const margin = glowBlur * 3
  const top = centres[0] - margin
  const style: PieceStyle = {
    left: centre.worldX,
    top: centre.worldY,
    width,
    zIndex: 0,
    '--board-piece-angle': `${laserAngle(beam.orientation)}deg`,
  }

  return (
    <svg
      aria-hidden="true"
      className="board-piece board-piece--laser-beam"
      data-board-height={height}
      data-board-laser-beam={beam.end}
      data-board-laser-cells={beam.cells}
      data-board-lift-height={liftHeight}
      data-board-tile={`${beam.x},${beam.y}`}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      viewBox={`0 0 ${size} ${size}`}
    >
      <defs>
        <filter
          id={`${id}-glow`}
          filterUnits="userSpaceOnUse"
          x={startX - margin}
          y={top}
          width={endX - startX + margin * 2}
          height={centres[centres.length - 1] + margin - top}
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={glowBlur} result="blur" />
          <feComposite in="blur" in2="SourceAlpha" operator="out" result="outside" />
          <feColorMatrix
            in="outside"
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0.87 0"
            result="glow"
          />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#D25252" />
          <stop offset="0.5" stopColor="#DAA8A8" />
          <stop offset="1" stopColor="#D25252" />
        </linearGradient>
      </defs>
      <g filter={`url(#${id}-glow)`}>
        {centres.map((y) => (
          <rect
            fill="#CF8686"
            height={thickness}
            key={y}
            rx={thickness / 2}
            width={endX - startX - glowInset * 2}
            x={startX + glowInset}
            y={y - thickness / 2}
          />
        ))}
      </g>
      {centres.map((y) => (
        <rect
          fill={`url(#${id}-fill)`}
          height={thickness}
          key={y}
          rx={thickness / 2}
          width={endX - startX}
          x={startX}
          y={y - thickness / 2}
        />
      ))}
    </svg>
  )
}
