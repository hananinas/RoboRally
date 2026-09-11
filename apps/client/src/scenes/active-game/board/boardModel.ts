export type BoardPoint = Readonly<{ x: number; y: number }>

export type BoardRecipeName = 'empty' | 'hole' | 'laser' | 'wallStack'

export type BoardCell = BoardPoint &
  Readonly<{
    recipe: BoardRecipeName
  }>

export type BoardRenderModel = Readonly<{
  columns: number
  rows: number
  cells: readonly BoardCell[]
}>

export type BoardComponentName =
  | 'ground'
  | 'laser1'
  | 'laser2'
  | 'laser3'
  | 'surface'
  | 'wallBlack'
  | 'wallYellow'

export type BoardSlice = Readonly<{
  component: BoardComponentName
  layer: number
  order?: number
  shadow?: boolean
}>

export type BoardTileRecipe = Readonly<{
  hole?: boolean
  slices: readonly BoardSlice[]
  stackBaseLayer?: number
}>

export type BoardVisualComponent = Readonly<{
  asset?: 'laser1' | 'laser2' | 'laser3'
  className: string
  width: number
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

type BoardAssignments = Partial<
  Readonly<Record<BoardRecipeName, readonly (readonly [number, number])[]>>
>

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

  const recipes = new Map<string, BoardRecipeName>()
  for (const [recipe, positions] of Object.entries(assignments) as [
    BoardRecipeName,
    readonly (readonly [number, number])[],
  ][]) {
    for (const [x, y] of positions) {
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

      const key = `${x},${y}`
      if (recipes.has(key)) {
        throw new RangeError(`Board cell ${key} is assigned twice`)
      }
      recipes.set(key, recipe)
    }
  }

  const cells = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: columns }, (_, x) => ({
      x,
      y,
      recipe: recipes.get(`${x},${y}`) ?? 'empty',
    })),
  ).flat()

  return { columns, rows, cells }
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
