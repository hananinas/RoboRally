import type {
  BoardComponentName,
  BoardRecipeName,
  BoardRenderConfig,
  BoardTileRecipe,
  BoardVisualComponent,
} from './boardModel.ts'
import { validateBoardRendering } from './boardModel.ts'

export const BOARD_CONFIG: BoardRenderConfig = {
  tile: 72,
  gap: 6,
  edgeWall: {
    width: 12,
    cornerRadius: 5,
  },
  parallax: 0.07,
  aboveGroundLayers: 13,
  parallaxReferenceLayer: 2,
  minimumHeight: 0.12,
  hoverHeight: 0.75,
  hoverScale: 1.025,
  hoverDuration: 0.08,
  hole: {
    layers: 8,
    maxDepth: 16,
    colourOffset: 0.4,
  },
  ripple: {
    amplitude: 20,
    speed: 20,
    frequency: 1,
    distanceFalloff: 0.8,
    trailFalloff: 0.55,
    lifetime: 2.3,
  },
  camera: {
    minZoom: 0.3,
    maxZoom: 4,
    wheelSensitivity: 0.001,
    dragThreshold: 4,
  },
}

function sprite(symbol: string, viewBox: string, width: number): BoardVisualComponent {
  return { asset: { symbol, viewBox }, className: 'board-piece--asset', width }
}

export const BOARD_COMPONENTS: Readonly<
  Record<BoardComponentName, BoardVisualComponent>
> = {
  antenna1: sprite('antenna1', '0 0 84 84', 7 / 6),
  antenna2: sprite('antenna2', '0 0 84 84', 7 / 6),
  antenna3: sprite('antenna3', '0 0 84 84', 7 / 6),
  antenna4: sprite('antenna4', '0 0 84 84', 7 / 6),
  antenna5: sprite('antenna5', '0 0 84 84', 7 / 6),
  antenna6: sprite('antenna6', '0 0 84 84', 7 / 6),
  antenna7: sprite('antenna7', '0 0 84 84', 7 / 6),
  antenna8: sprite('antenna8', '0 0 84 84', 7 / 6),
  antenna9: sprite('antenna9', '0 0 84 84', 7 / 6),
  antenna10: sprite('antenna10', '0 0 84 84', 7 / 6),
  ground: { className: 'board-piece--ground', width: 1 },
  surface: { className: 'board-piece--surface', width: 1 },
  wallBlack: { className: 'board-piece--wall-black', width: 0.6 },
  wallYellow: { className: 'board-piece--wall-yellow', width: 0.6 },
  wallEdgeBlack: {
    className: 'board-piece--wall-edge board-piece--wall-edge-black',
    width: 1,
  },
  wallEdgeYellow: {
    className: 'board-piece--wall-edge board-piece--wall-edge-yellow',
    width: 1,
  },
  laser1: sprite('laser1', '0 0 72 72', 0.82),
  laser2: sprite('laser2', '0 0 72 87', 0.82),
  laser3: sprite('laser3', '0 0 72 72', 0.82),
  testTank1: sprite('testTank1', '0 0 57 87', 0.65),
  testTank2: sprite('testTank2', '0 0 57 87', 0.65),
  testTank3: sprite('testTank3', '0 0 57 87', 0.65),
  testTank4: sprite('testTank4', '0 0 57 87', 0.65),
  testTank5: sprite('testTank5', '0 0 57 87', 0.65),
  conveyor:{
    asset: {
      symbol: 'conveyor-1-straight',
      viewBox: '0 0 72 72',
    },
    className: 'board-piece--asset',
    width: 1,
  },   
  testTank6: sprite('testTank6', '0 0 57 87', 0.65),
  testTank7: sprite('testTank7', '0 0 57 87', 0.65),
  testTank8: sprite('testTank8', '0 0 57 87', 0.65),
}

const EMPTY_SLICES = [
  { layer: 0, component: 'ground', shadow: true },
  { layer: 1, component: 'ground' },
  { layer: 2, component: 'ground' },
  { layer: 3, component: 'surface' },
] as const

export const BOARD_RECIPES: Readonly<
  Record<BoardRecipeName, BoardTileRecipe>
> = {
  empty: { slices: EMPTY_SLICES },
  antenna: {
    stackBaseLayer: 3,
    slices: [
      { layer: 0, component: 'ground', shadow: true },
      { layer: 1, component: 'antenna1' },
      { layer: 2, component: 'antenna2' },
      { layer: 3, component: 'antenna3' },
      { layer: 4, component: 'antenna4' },
      { layer: 5, component: 'antenna5' },
      { layer: 6, component: 'antenna6' },
      { layer: 7, component: 'antenna7' },
      { layer: 8, component: 'antenna8' },
      { layer: 9, component: 'antenna9' },
      { layer: 10, component: 'antenna10' },
    ],
  },
  hole: { hole: true, slices: [] },
  pillar: {
    slices: [
      { layer: 0, component: 'wallBlack', shadow: true },
      { layer: 1, component: 'wallBlack' },
      { layer: 2, component: 'wallYellow' },
      { layer: 3, component: 'wallYellow' },
      { layer: 4, component: 'wallBlack' },
      { layer: 5, component: 'wallBlack' },
      { layer: 6, component: 'wallYellow' },
      { layer: 7, component: 'wallYellow' },
      { layer: 8, component: 'wallBlack' },
      { layer: 9, component: 'wallBlack' },
      { layer: 10, component: 'wallYellow' },
      { layer: 11, component: 'wallYellow' },
      { layer: 12, component: 'wallYellow' },
      { layer: 13, component: 'wallYellow' },
    ],
  },
  laser: {
    stackBaseLayer: 3,
    slices: [
      ...EMPTY_SLICES,
      { layer: 3, component: 'laser1', order: 1 },
      { layer: 4, component: 'laser1' },
      { layer: 5, component: 'laser2' },
      { layer: 6, component: 'laser3' },
    ],
  },
  conveyor: {
    slices: [
      ...EMPTY_SLICES,
      { layer: 3, component: 'conveyor', order: 1 },
    ],
  },  
}

export const BOARD_EDGE_WALL_SLICES = [
  { layer: 0, component: 'wallEdgeBlack', order: 2 },
  { layer: 1, component: 'wallEdgeBlack', order: 2 },
  { layer: 2, component: 'wallEdgeYellow', order: 2 },
  { layer: 3, component: 'wallEdgeYellow', order: 2 },
  { layer: 4, component: 'wallEdgeBlack', order: 2 },
  { layer: 5, component: 'wallEdgeBlack', order: 2 },
  { layer: 6, component: 'wallEdgeYellow', order: 2 },
  { layer: 7, component: 'wallEdgeYellow', order: 2 },
] as const

validateBoardRendering(BOARD_CONFIG, BOARD_COMPONENTS, BOARD_RECIPES)
