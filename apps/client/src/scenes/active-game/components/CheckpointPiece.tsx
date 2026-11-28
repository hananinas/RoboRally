import { BOARD_CONFIG } from '../board/boardConfig.ts'
import type { BoardSceneTile } from '../board/boardScene.ts'

const BASE_LAYER = 3
const DIAMETER = 22
const PUSHCAP_SLICES = [
  { radius: 7, fill: '#313131' },
  { radius: 6.5, fill: '#6e7986' },
  { radius: 5, fill: '#c6c6c6' },
  { radius: 4.5, fill: '#7e8a98' },
  { radius: 4.5, fill: '#7e8a98' },
  { radius: 6, fill: '#313131' },
  { radius: 9.5, fill: '#313131' },
  { radius: 11, fill: '#a34242' },
  { radius: 11, fill: '#c74f4f' },
  { radius: 10.5, fill: '#d86965' },
  { radius: 9.75, fill: '#c74f4f' },
] as const

export default function CheckpointPiece({ tile, layer, claimedColour }: {
  tile: BoardSceneTile
  layer: number
  // The winner's colour, once the final checkpoint has been claimed.
  claimedColour?: string
}) {
  const number = tile.cell.checkpointNumber
  const slice = PUSHCAP_SLICES[layer - BASE_LAYER]
  if (number === undefined || !slice) return null
  const isCap = layer === BASE_LAYER + PUSHCAP_SLICES.length - 1
  const height = layer / BOARD_CONFIG.parallaxReferenceLayer
  // Lift the entire stack with its tile, while retaining each slice's parallax.
  const liftHeight = BASE_LAYER / BOARD_CONFIG.parallaxReferenceLayer

  return (
    <svg
      className="board-piece board-piece--checkpoint"
      role={isCap ? 'img' : undefined}
      aria-label={isCap ? `Checkpoint ${number}` : undefined}
      aria-hidden={isCap ? undefined : true}
      data-board-checkpoint={isCap ? number : undefined}
      data-board-checkpoint-slice={number}
      data-claimed={claimedColour !== undefined || undefined}
      data-board-tile={`${tile.cell.x},${tile.cell.y}`}
      data-board-height={height}
      data-board-lift-height={liftHeight}
      style={{
        left: tile.tileCentre.worldX - BOARD_CONFIG.tile / 3,
        top: tile.tileCentre.worldY - BOARD_CONFIG.tile / 3,
        width: DIAMETER,
        zIndex: 1,
      }}
      viewBox="-11 -11 22 22"
    >
      <circle r={slice.radius} fill={isCap && claimedColour ? claimedColour : slice.fill} />
      {isCap && (
        <text className="board-checkpoint-number" textAnchor="middle" dy=".35em">
          {number}
        </text>
      )}
    </svg>
  )
}
