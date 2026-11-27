import { mock } from 'node:test'
import './deterministic-random.mjs'
import { boardMaps } from '../../game-service/dist/domain/game/boardMaps.js'
import { createBoard } from '../../game-service/dist/domain/game/BoardFactory.js'
import { DECK_INSTRUCTIONS } from '../../game-service/dist/domain/game/deckComposition.js'
import { Game } from '../../game-service/dist/domain/game/Game.js'

// Controlled row for browser tests; all gameplay uses the real service and the
// real test-map. Clear of every pit/wall. The pusher at x=6 can push the robot
// at x=5 one tile west, but the robot at x=3 is then behind it, so the next step
// is blocked (issue #273: PUSH_LIMIT = 1).
const ROW_Y = 13
const COLUMNS = [6, 5, 3]

mock.module('../../game-service/dist/domain/game/GameFactory.js', {
  cache: true,
  exports: {
    createGame: (mapName, name) => new Game({
      board: createBoard({ ...boardMaps[mapName], startTiles: COLUMNS.map((x) => [x, ROW_Y]) }),
      players: [],
      deck: DECK_INSTRUCTIONS,
      name,
    }),
  },
})

await import('../../game-service/dist/main.js')
