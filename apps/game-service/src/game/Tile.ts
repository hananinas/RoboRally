export type TileWalls = Readonly<{
  north: boolean
  east: boolean
  south: boolean
  west: boolean
}>

// A v0 floor tile. Walls belong to its edges, as in the proposed UML.
// Tile actions and robot occupancy will be added with their respective models.
export class Tile {
  readonly walls: TileWalls

  constructor(walls: Partial<TileWalls> = {}) {
    this.walls = Object.freeze({
      north: walls.north ?? false,
      east: walls.east ?? false,
      south: walls.south ?? false,
      west: walls.west ?? false,
    })
  }
}
