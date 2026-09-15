import { holeProfile, tileCentre, type TileCentre } from './boardMath.ts'
import { BOARD_EDGE_WALL_SLICES } from './boardConfig.ts'
import type {
  BoardCell,
  BoardComponentName,
  BoardRecipeName,
  BoardRenderConfig,
  BoardRenderModel,
  BoardSlice,
  BoardTileRecipe,
  BoardVisualComponent,
} from './boardModel.ts'
import { BOARD_WALL_SIDES, hasAllWalls } from './boardModel.ts'

export type BoardScenePiece = Readonly<{
  cell: BoardCell
  component: BoardVisualComponent
  componentName: BoardComponentName
  height: number
  key: string
  liftHeight: number
  slice: BoardSlice
  tileCentre: TileCentre
}>

export type BoardSceneHole = Readonly<{
  cell: BoardCell
  depths: ReturnType<typeof holeProfile>
  key: string
  tileCentre: TileCentre
}>

export type BoardSceneTile = Readonly<{
  cell: BoardCell
  hole: boolean
  tileCentre: TileCentre
}>

export type BoardScene = Readonly<{
  holes: readonly BoardSceneHole[]
  planes: readonly (readonly BoardScenePiece[])[]
  tiles: readonly BoardSceneTile[]
}>

export function createBoardScene(
  board: BoardRenderModel,
  config: BoardRenderConfig,
  components: Readonly<Record<BoardComponentName, BoardVisualComponent>>,
  recipes: Readonly<Record<BoardRecipeName, BoardTileRecipe>>,
): BoardScene {
  // Pieces stay grouped by global plane to preserve cross-tile paint order
  const planes: BoardScenePiece[][] = Array.from(
    { length: config.aboveGroundLayers + 1 },
    () => [],
  )
  const holes: BoardSceneHole[] = []
  const tiles: BoardSceneTile[] = []

  for (const cell of board.cells) {
    const pillar = hasAllWalls(cell.walls)
    const recipe = recipes[pillar ? 'pillar' : cell.tile]
    const centre = tileCentre(cell, board, config)
    tiles.push({ cell, hole: recipe.hole ?? false, tileCentre: centre })

    if (recipe.hole) {
      holes.push({
        cell,
        depths: holeProfile(config.hole),
        key: `${cell.x},${cell.y},hole`,
        tileCentre: centre,
      })
    } else {
      recipe.slices.forEach((slice, sliceIndex) => {
        addSlice(slice, sliceIndex, recipe.stackBaseLayer)
      })
    }

    if (!pillar) {
      for (const side of BOARD_WALL_SIDES) {
        if (!cell.walls[side]) continue
        BOARD_EDGE_WALL_SLICES.forEach((slice, sliceIndex) => {
          addSlice({ ...slice, wall: side }, sliceIndex)
        })
      }
    }

    function addSlice(
      slice: BoardSlice,
      sliceIndex: number,
      stackBaseLayer?: number,
    ) {
      const height = slice.layer / config.parallaxReferenceLayer
      const liftHeight =
        stackBaseLayer === undefined
          ? height
          : Math.min(
              height,
              stackBaseLayer / config.parallaxReferenceLayer,
            )
      planes[slice.layer].push({
        cell,
        component: components[slice.component],
        componentName: slice.component,
        height,
        key: `${cell.x},${cell.y},${slice.layer},${slice.component},${slice.wall ?? 'tile'},${sliceIndex}`,
        liftHeight,
        slice,
        tileCentre: centre,
      })
    }
  }

  return { holes, planes, tiles }
}
