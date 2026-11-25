import { mock } from 'node:test'
import { Deck } from '../../game-service/dist/game/Deck.js'
import './deterministic-random.mjs'
import { Integer } from '../../game-service/dist/numbers.js'
import { createGame as realCreateGame } from '../../game-service/dist/game/GameFactory.js'

// Controlled row for browser tests; all gameplay uses the real service and the
// real test-map. Clear of every pit/wall, with room to push two tiles west.
const ROW_Y = 13
const COLUMNS = [6, 5, 4]

const originalFromTemplate = Deck.fromTemplate

Deck.fromTemplate = (template) => {
  const remaining = [...template]
  const instructions = [
    'TURN_RIGHT',
    'TURN_RIGHT',
    'TURN_RIGHT',
    'TURN_RIGHT',
    'TURN_LEFT',
    'TURN_LEFT',
    'MOVE_2',
    'MOVE_3',
    'BACK_UP',
  ]

  const initialHand = instructions.map((instruction) => {
    const index = remaining.findIndex(
      (card) => card.instruction === instruction
    )

    if (index === -1) {
      throw new Error(`Missing test card: ${instruction}`)
    }

    return remaining.splice(index, 1)[0]
  })

  const deck = originalFromTemplate([
    ...initialHand,
    ...remaining,
  ])

  const originalDraw = deck.draw.bind(deck)
  let firstDraw = true

  deck.draw = (count) => {
    if (!firstDraw) return originalDraw(count)

    firstDraw = false
    const random = Math.random
    Math.random = () => 0

    try {
      return originalDraw(count)
    } finally {
      Math.random = random
    }
  }

  return deck
}

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
