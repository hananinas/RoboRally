import { mock } from 'node:test'
import './deterministic-random.mjs'
import { Integer } from '../../game-service/dist/numbers.js'
import { createGame as realCreateGame } from '../../game-service/dist/game/GameFactory.js'

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
// Fixed draw seed: every player's first hand holds the cards the pushing programs use.
const CARD_SEED = 3674
const deck = createDeckCards(). filter(({ instruction}) => !instruction.endsWith('_ROUTINE'))
const game = new Game({ board, players: [], deck, rebootTile: { x: Integer(5), y: Integer(5) }, name: 'Shared game', random: Math.random, drawRandom: seededRandom(CARD_SEED) })
const config = parseAppConfig(process.env)
const oidcClient = await createOidcClient(config.oidc)
const sessionStore = createSessionStore({ oidcClient, refreshBufferSeconds: config.oidc.refreshBufferSeconds })
const server = createServer()
const authApp = createAuthApp({
  oidcClient,
  sessionStore,
  kratosSettingsUrl: config.kratosSettingsUrl,
  refreshTokenTtlSeconds: config.refreshTokenTtlSeconds,
})
server.on('request', (req, res) => {
  if (req.url?.startsWith('/auth/')) {
    authApp(req, res)
  }
})
const io = createGameSocketServer(server, sessionStore, () => ({ gameId: '00000000-0000-4000-8000-000000000001', game }))
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Game Service listening at http://127.0.0.1:${config.port}`)
// Controlled row for browser tests; all gameplay uses the real service and the
// real test-map. Clear of every pit/wall, with room to push two tiles west.
const ROW_Y = 13
const COLUMNS = [6, 5, 4]

mock.module('../../game-service/dist/game/GameFactory.js', {
  cache: true,
  exports: {
    createGame: (mapName, name) => {
      const game = realCreateGame(mapName, name)
      const realAddPlayer = game.addPlayer.bind(game)
      let joined = 0
      game.addPlayer = (colour) => {
        const result = realAddPlayer(colour)
        joined++
        if (joined === COLUMNS.length) {
          game.players.forEach((player, index) => {
            game.board.relocateRobot(player.robot.id, { x: Integer(COLUMNS[index]), y: Integer(ROW_Y) })
          })
        }
        return result
      }
      return game
    },
  },
})

await import('../../game-service/dist/main.js')
