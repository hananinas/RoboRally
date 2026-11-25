import { mock } from 'node:test'
import './deterministic-random.mjs'
import { Integer } from '../../game-service/dist/numbers.js'
import { createGame as realCreateGame } from '../../game-service/dist/game/GameFactory.js'

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
            game.board.relocateRobot(player.robot.id, {
              x: Integer(COLUMNS[index]),
              y: Integer(ROW_Y),
            })
          })
        }
        return result
      }
      return game
    },
  },
})

await import('../../game-service/dist/main.js')
