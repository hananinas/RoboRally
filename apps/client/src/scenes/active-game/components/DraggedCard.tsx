import { cardPresentation } from './cardInstructions.ts'
import type { CardDrag } from './useCardDrag.ts'


function DraggedCard({ drag }: { drag: CardDrag }) {
  const size = drag.overRegister === null ? 'hand' : 'register'
  const presentation = cardPresentation[drag.card.instruction]

  return (
    <div
      className={`program-card program-card--${size} dragged-card`}
      style={{ left: drag.x, top: drag.y }}
    >
      <img
        src={presentation.icon}
        alt=""
        className="program-card__icon"
        draggable={false}
      />
      <span className="program-card__label">{presentation.label}</span>
    </div>
  )
}

export default DraggedCard