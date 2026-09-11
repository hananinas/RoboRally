import { holeProfile, tileCentre, type TileCentre } from './boardMath.ts'
import type {
  BoardCell,
  BoardComponentName,
  BoardRecipeName,
  BoardRenderConfig,
  BoardRenderModel,
  BoardSlice,
  BoardVisualComponent,
} from './boardModel.ts'

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
  recipes: Readonly<Record<BoardRecipeName, Readonly<{
    hole?: boolean
    slices: readonly BoardSlice[]
    stackBaseLayer?: number
  }>>>,
): BoardScene {
  // Pieces stay grouped by global plane to preserve cross-tile paint order
  const planes: BoardScenePiece[][] = Array.from(
    { length: config.aboveGroundLayers + 1 },
    () => [],
  )
  const holes: BoardSceneHole[] = []
  const tiles: BoardSceneTile[] = []

  for (const cell of board.cells) {
    const recipe = recipes[cell.recipe]
    const centre = tileCentre(cell, board, config)
    tiles.push({ cell, hole: recipe.hole ?? false, tileCentre: centre })

    if (recipe.hole) {
      holes.push({
        cell,
        depths: holeProfile(config.hole),
        key: `${cell.x},${cell.y},hole`,
        tileCentre: centre,
      })
      continue
    }

    recipe.slices.forEach((slice, sliceIndex) => {
      const height = slice.layer / config.parallaxReferenceLayer
      const liftHeight =
        recipe.stackBaseLayer === undefined
          ? height
          : Math.min(
              height,
              recipe.stackBaseLayer / config.parallaxReferenceLayer,
            )
      planes[slice.layer].push({
        cell,
        component: components[slice.component],
        componentName: slice.component,
        height,
        key: `${cell.x},${cell.y},${slice.layer},${slice.component},${sliceIndex}`,
        liftHeight,
        slice,
        tileCentre: centre,
      })
    })
  }

  return { holes, planes, tiles }
}
