export type GameMap = Readonly<{
    name: string
    icon: string
    maxPlayers: number
}>

export const DEMO_MAP: GameMap = Object.freeze({
  name: 'DEMO MAP',
  icon: 'demo-map',
  maxPlayers: 6,
})