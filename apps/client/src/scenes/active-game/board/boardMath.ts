import type {
  BoardPoint,
  BoardRenderConfig,
  BoardRenderModel,
} from './boardModel.ts'

export type Camera = Readonly<{ x: number; y: number; zoom: number }>
export type ScreenPoint = Readonly<{ x: number; y: number }>
export type TileCentre = Readonly<{ worldX: number; worldY: number }>
export type ViewportSize = Readonly<{ width: number; height: number }>
export type Ripple = BoardPoint & Readonly<{ startedAt: number }>

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

export function approach(
  value: number,
  target: number,
  step: number,
): number {
  return value < target
    ? Math.min(target, value + step)
    : Math.max(target, value - step)
}

export function tileCentre(
  point: BoardPoint,
  board: Pick<BoardRenderModel, 'columns' | 'rows'>,
  config: Pick<BoardRenderConfig, 'gap' | 'tile'>,
): TileCentre {
  const pitch = config.tile + config.gap
  return {
    worldX: (point.x - (board.columns - 1) / 2) * pitch,
    worldY: (point.y - (board.rows - 1) / 2) * pitch,
  }
}

// Screen points are relative to the viewport centre
export function screenToWorld(point: ScreenPoint, camera: Camera): ScreenPoint {
  return {
    x: (point.x - camera.x) / camera.zoom,
    y: (point.y - camera.y) / camera.zoom,
  }
}

export function parallaxOffset(
  centre: TileCentre,
  camera: Camera,
  viewport: ViewportSize,
  config: Pick<BoardRenderConfig, 'parallax' | 'tile'>,
): ScreenPoint {
  const reference = Math.max(viewport.width, viewport.height) / 2 || 1
  const maxOffset = config.tile * config.parallax
  const screenX = camera.x + centre.worldX * camera.zoom
  const screenY = camera.y + centre.worldY * camera.zoom

  return {
    x: (screenX / reference) * maxOffset,
    y: (screenY / reference) * maxOffset,
  }
}

export function cellAtPoint(
  point: ScreenPoint,
  camera: Camera,
  board: Pick<BoardRenderModel, 'columns' | 'rows'>,
  config: Pick<BoardRenderConfig, 'gap' | 'tile'>,
): BoardPoint | null {
  const world = screenToWorld(point, camera)
  const pitch = config.tile + config.gap
  const x = Math.round(world.x / pitch + (board.columns - 1) / 2)
  const y = Math.round(world.y / pitch + (board.rows - 1) / 2)

  if (x < 0 || x >= board.columns || y < 0 || y >= board.rows) {
    return null
  }

  const centre = tileCentre({ x, y }, board, config)
  if (
    Math.abs(world.x - centre.worldX) > config.tile / 2 ||
    Math.abs(world.y - centre.worldY) > config.tile / 2
  ) {
    return null
  }

  return { x, y }
}

export function zoomAround(
  point: ScreenPoint,
  camera: Camera,
  zoom: number,
): Camera {
  const world = screenToWorld(point, camera)
  return {
    x: point.x - world.x * zoom,
    y: point.y - world.y * zoom,
    zoom,
  }
}

export function holeProfile(
  hole: BoardRenderConfig['hole'],
): readonly Readonly<{ blend: number; height: number }>[] {
  return Array.from({ length: hole.layers }, (_, index) => {
    const ratio = (index + 1) / hole.layers
    return {
      height: -hole.maxDepth * ratio,
      blend: hole.colourOffset + (1 - hole.colourOffset) * ratio,
    }
  })
}

export function rippleHeight(
  tile: BoardPoint,
  ripples: readonly Ripple[],
  now: number,
  settings: BoardRenderConfig['ripple'],
): number {
  let height = 0

  for (const ripple of ripples) {
    const age = (now - ripple.startedAt) / 1000
    if (age < 0 || age >= settings.lifetime) continue

    const distance = Math.hypot(tile.x - ripple.x, tile.y - ripple.y)
    const behindFront = age * settings.speed - distance
    if (behindFront < 0) continue

    height +=
      Math.cos(behindFront * settings.frequency) *
      settings.amplitude *
      Math.exp(-distance * settings.distanceFalloff) *
      Math.exp(-behindFront * settings.trailFalloff)
  }

  return height
}

export function surfaceEffect(
  hover: number,
  wave: number,
  config: Pick<
    BoardRenderConfig,
    'hoverHeight' | 'hoverScale' | 'minimumHeight'
  >,
): Readonly<{ height: number; scale: number }> {
  const easedHover = smoothstep(hover)
  return {
    height: Math.max(
      config.minimumHeight,
      1 + easedHover * config.hoverHeight + wave,
    ),
    scale: 1 + easedHover * (config.hoverScale - 1),
  }
}

export function liftedDepth(
  height: number,
  liftHeight: number,
  multiplier: number,
): number {
  return height <= 0 ? height : height + liftHeight * (multiplier - 1)
}
