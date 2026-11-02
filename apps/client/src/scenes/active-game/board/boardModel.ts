import type { Antenna } from '@robo-rally/game-events'

export type BoardPoint = Readonly<{ x: number; y: number }>

export type BoardTileType = 'empty' | 'hole' | 'laser' | 'gearClockwise' | 'gearCounterclockwise'
export type BoardRecipeName = BoardTileType | 'pillar' | 'antenna'
export type BoardWallSide = 'north' | 'east' | 'south' | 'west'
export type BoardTileWalls = Readonly<Record<BoardWallSide, boolean>>

export type BoardCell = BoardPoint &
  Readonly<{
    tile: BoardTileType
    walls: BoardTileWalls
    checkpointNumber?: number
  }>

export type BoardRenderModel = Readonly<{
  columns: number
  rows: number
  antenna?: Antenna
  cells: readonly BoardCell[]
}>

export type BoardComponentName =
  | `antenna${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`
  | `gear${1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | 'gearClockwise'
  | 'gearCounterclockwise'
  | 'ground'
  | 'laser1'
  | 'laser2'
  | 'laser3'
  | 'testTank1'
  | 'testTank2'
  | 'testTank3'
  | 'testTank4'
  | 'testTank5'
  | 'testTank6'
  | 'testTank7'
  | 'testTank8'
  | 'surface'
  | 'wallEdgeBlack'
  | 'wallEdgeYellow'
  | 'wallBlack'
  | 'wallYellow'

export type BoardSlice = Readonly<{
  component: BoardComponentName
  layer: number
  order?: number
  shadow?: boolean
  wall?: BoardWallSide
}>

export type BoardTileRecipe = Readonly<{
  hole?: boolean
  slices: readonly BoardSlice[]
  stackBaseLayer?: number
}>

export type BoardSpriteAsset = Readonly<{
  symbol: string
  viewBox: string
}>

export type BoardVisualComponent = Readonly<{
  asset?: BoardSpriteAsset
  className: string
  width: number
  label?: string
}>

export type BoardRenderConfig = Readonly<{
  aboveGroundLayers: number
  camera: Readonly<{
    dragThreshold: number
    maxZoom: number
    minZoom: number
    wheelSensitivity: number
  }>
  gap: number
  edgeWall: Readonly<{
    cornerRadius: number
    width: number
  }>
  hole: Readonly<{
    colourOffset: number
    layers: number
    maxDepth: number
  }>
  hoverDuration: number
  hoverHeight: number
  hoverScale: number
  minimumHeight: number
  parallax: number
  parallaxReferenceLayer: number
  ripple: Readonly<{
    amplitude: number
    distanceFalloff: number
    frequency: number
    lifetime: number
    speed: number
    trailFalloff: number
  }>
  tile: number
}>

type BoardWallAssignment = BoardPoint & Partial<BoardTileWalls>
type BoardAssignments = Readonly<{
  antenna?: Antenna
  hole?: readonly (readonly [number, number])[]
  laser?: readonly (readonly [number, number])[]
  gearClockwise?: readonly (readonly [number, number])[]
  gearCounterclockwise?: readonly (readonly [number, number])[]
  walls?: readonly BoardWallAssignment[]
  checkpoints?: readonly (BoardPoint & { checkpointNumber: number })[]
}>

export const BOARD_WALL_SIDES: readonly BoardWallSide[] = [
  'north',
  'east',
  'south',
  'west',
]

function createTileWalls(walls: Partial<BoardTileWalls> = {}): BoardTileWalls {
  return Object.freeze({
    north: walls.north ?? false,
    east: walls.east ?? false,
    south: walls.south ?? false,
    west: walls.west ?? false,
  })
}

const EMPTY_WALLS = createTileWalls()

export function hasAllWalls(walls: BoardTileWalls): boolean {
  return BOARD_WALL_SIDES.every((side) => walls[side])
}

export function createBoardRenderModel(
  columns: number,
  rows: number,
  assignments: BoardAssignments = {},
): BoardRenderModel {
  if (!Number.isInteger(columns) || columns <= 0) {
    throw new RangeError('Board columns must be a positive integer')
  }
  if (!Number.isInteger(rows) || rows <= 0) {
    throw new RangeError('Board rows must be a positive integer')
  }

  function positionKey(x: number, y: number): string {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      x >= columns ||
      y < 0 ||
      y >= rows
    ) {
      throw new RangeError(`Board cell ${x},${y} is outside the board`)
    }
    return `${x},${y}`
  }

  if (assignments.antenna) {
    positionKey(assignments.antenna.x, assignments.antenna.y)
    if (!Number.isFinite(assignments.antenna.angle)) {
      throw new RangeError('Board antenna angle must be finite')
    }
  }

  const tiles = new Map<string, BoardTileType>()
  for (const tile of ['hole', 'laser', 'gearClockwise', 'gearCounterclockwise'] as const) {
    const positions = assignments[tile] ?? []
    for (const [x, y] of positions) {
      const key = positionKey(x, y)
      if (tiles.has(key)) {
        throw new RangeError(`Board cell ${key} is assigned twice`)
      }
      tiles.set(key, tile)
    }
  }

  const walls = new Map<string, BoardTileWalls>()
  for (const assignment of assignments.walls ?? []) {
    const key = positionKey(assignment.x, assignment.y)
    if (walls.has(key)) {
      throw new RangeError(`Board walls for cell ${key} are assigned twice`)
    }
    walls.set(key, createTileWalls(assignment))
  }

  const checkpoints = new Map<string, number>()
  for (const { x, y, checkpointNumber } of assignments.checkpoints ?? []) {
    const key = positionKey(x, y)
    if (!Number.isSafeInteger(checkpointNumber) || checkpointNumber < 1 || checkpoints.has(key)) {
      throw new RangeError(`Invalid checkpoint assignment for cell ${key}`)
    }
    checkpoints.set(key, checkpointNumber)
  }

  const cells = Object.freeze(
    Array.from({ length: rows }, (_, y) =>
      Array.from({ length: columns }, (_, x) =>
        Object.freeze({
          x,
          y,
          tile: tiles.get(`${x},${y}`) ?? 'empty',
          walls: walls.get(`${x},${y}`) ?? EMPTY_WALLS,
          ...(checkpoints.has(`${x},${y}`) ? { checkpointNumber: checkpoints.get(`${x},${y}`) } : {}),
        }),
      ),
    ).flat(),
  )

  return Object.freeze({
    columns, rows, cells,
    ...(assignments.antenna ? { antenna: Object.freeze({ ...assignments.antenna }) } : {}),
  })
}

export function validateBoardRendering(
  config: BoardRenderConfig,
  components: Readonly<Record<BoardComponentName, BoardVisualComponent>>,
  recipes: Readonly<Record<BoardRecipeName, BoardTileRecipe>>,
): void {
  const positive = (value: number) => Number.isFinite(value) && value > 0
  const nonnegative = (value: number) =>
    Number.isFinite(value) && value >= 0

  if (!positive(config.tile) || !nonnegative(config.gap)) {
    throw new RangeError('Board tile must be positive and gap cannot be negative')
  }
  if (
    !positive(config.edgeWall.width) ||
    config.edgeWall.width > config.tile ||
    !nonnegative(config.edgeWall.cornerRadius)
  ) {
    throw new RangeError('Board edge wall configuration is invalid')
  }
  if (
    !Number.isInteger(config.aboveGroundLayers) ||
    config.aboveGroundLayers <= 0 ||
    !positive(config.parallaxReferenceLayer)
  ) {
    throw new RangeError('Board layer configuration is invalid')
  }
  if (
    !Number.isInteger(config.hole.layers) ||
    config.hole.layers <= 0 ||
    !nonnegative(config.hole.maxDepth) ||
    !nonnegative(config.hole.colourOffset) ||
    config.hole.colourOffset > 1
  ) {
    throw new RangeError('Board hole configuration is invalid')
  }
  if (
    !positive(config.camera.minZoom) ||
    config.camera.maxZoom < config.camera.minZoom ||
    !positive(config.camera.wheelSensitivity) ||
    !nonnegative(config.camera.dragThreshold)
  ) {
    throw new RangeError('Board camera configuration is invalid')
  }

  for (const [name, component] of Object.entries(components)) {
    if (!positive(component.width)) {
      throw new RangeError(`Board component ${name} width must be positive`)
    }
  }

  for (const [name, recipe] of Object.entries(recipes)) {
    if (recipe.hole && recipe.slices.length > 0) {
      throw new RangeError(`Board recipe ${name} cannot mix a hole and slices`)
    }
    if (
      recipe.stackBaseLayer !== undefined &&
      (!Number.isInteger(recipe.stackBaseLayer) ||
        recipe.stackBaseLayer <= 0 ||
        recipe.stackBaseLayer > config.aboveGroundLayers ||
        !recipe.slices.some(
          (slice) => slice.layer === recipe.stackBaseLayer,
        ))
    ) {
      throw new RangeError(`Board recipe ${name} has an invalid stack base`)
    }

    for (const slice of recipe.slices) {
      if (
        !Number.isInteger(slice.layer) ||
        slice.layer < 0 ||
        slice.layer > config.aboveGroundLayers
      ) {
        throw new RangeError(
          `Board recipe ${name} uses an unavailable layer`,
        )
      }
      if (!components[slice.component]) {
        throw new RangeError(
          `Board recipe ${name} uses an unknown component`,
        )
      }
      if (!Number.isInteger(slice.order ?? 0)) {
        throw new RangeError(`Board recipe ${name} has an invalid order`)
      }
      if (slice.shadow && slice.layer !== 0) {
        throw new RangeError(
          `Board recipe ${name} has a shadow above ground`,
        )
      }
    }
  }
}
