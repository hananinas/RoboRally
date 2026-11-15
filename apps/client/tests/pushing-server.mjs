import { register } from 'node:module'
import { Integer } from '../../game-service/dist/numbers.js'

register('./intercept-create-game-hooks.mjs', import.meta.url)

// Fixed draw constant: Deck.draw picks against a shrinking pile, so even a
// fixed value yields a varied, repeatable sequence of cards from draw to draw.
Math.random = () => 0.55

// Controlled row for browser tests; all gameplay uses the real service and the
// real test-map. Clear of every pit/wall, with room to push two tiles west.
const ROW_Y = 13
const COLUMNS = [6, 5, 4]

globalThis.__onGameCreated = (game) => {
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
}

await import('../../game-service/dist/main.js')
