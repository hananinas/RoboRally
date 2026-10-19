import type { GameMap } from '@robo-rally/game-events'

// Placeholder artwork until real maps exist: a plain grid in an SVG.
const DEMO_MAP_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3">' +
  '<rect width="4" height="3" fill="#6b7280"/>' +
  '<path d="M1 0V3M2 0V3M3 0V3M0 1H4M0 2H4" stroke="#d1d5db" stroke-width="0.05"/>' +
  '</svg>'

export const DEMO_MAP: GameMap = Object.freeze({
  name: 'DEMO MAP',
  icon: `data:image/svg+xml;base64,${Buffer.from(DEMO_MAP_SVG).toString('base64')}`,
  maxPlayers: 6,
})
