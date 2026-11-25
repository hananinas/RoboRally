import { Deck } from '../../game-service/dist/game/Deck.js'

// Repeatable card draws for e2e tests.
Math.random = () => 0.55

// Preserve the original deck composition for deterministic tests.
const originalFromTemplate = Deck.fromTemplate

Deck.fromTemplate = (template) => {
  return originalFromTemplate(
    template.filter(({ instruction }) =>
      !instruction.endsWith('_ROUTINE')
    )
  )
}
