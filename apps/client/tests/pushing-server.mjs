import { Board, Direction, EmptyTile, Game, PitTile, createHand } from '../../game-service/dist/game/index.js'
import { Integer } from '../../game-service/dist/numbers.js'
import { startGameServer } from './real-game-server.mjs'

// Controlled boards for browser tests; all gameplay uses the real service.
const scenario = process.argv[2]
const tiles = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => new EmptyTile()))
if (scenario === 'blocked') tiles[3][1] = new EmptyTile([Direction.WEST])
if (scenario === 'pit') tiles[3][0] = new PitTile()
const icon = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="gray"/></svg>',
).toString('base64')
const board = new Board(tiles, { x: Integer(0), y: Integer(0), angle: 0 }, {
  name: 'Pushing test board', icon, maxPlayers: 6,
})
const game = new Game(board, [], createHand(), { x: Integer(5), y: Integer(5) }, 'Shared game')
startGameServer(() => ({ gameId: '00000000-0000-4000-8000-000000000001', game }))
