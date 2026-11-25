import type {
  PendingCardChoice,
  ResolvedInstruction,
} from '@robo-rally/game-events'
import Panel from './Panel.tsx'
import { cardPresentation } from './cardInstructions.ts'

type CardChoicePanelProps = {
  choice: PendingCardChoice
  status: string
  choosing: boolean
  disabled: boolean
  error: string | null
  onChoose?: (instruction: ResolvedInstruction) => void
}

function CardChoicePanel({
  choice,
  status,
  choosing,
  disabled,
  error,
  onChoose,
}: CardChoicePanelProps) {
  return (
    <Panel className="card-choice">
      <h2 className="register-panel__heading">
        {cardPresentation[choice.instruction].label}
        {' · Register '}
        {choice.registerIndex + 1}
      </h2>

      <div className="game-status">
        <p role="status">
          {choosing ? 'Sending choice…' : status}
        </p>

        {error && <p role="alert">{error}</p>}
      </div>

      {onChoose && (
        <div className="card-choice__actions">
          {choice.options.map((instruction) => (
            <button
              key={instruction}
              type="button"
              className="register-panel__done"
              disabled={disabled || choosing}
              onClick={() => onChoose(instruction)}
            >
              {cardPresentation[instruction].label}
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

export default CardChoicePanel