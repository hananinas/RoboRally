import {
  registersAreFilled,
  type ClientGameState,
  type ProgramCard as Card,
  type Registers,
} from '../gameState.ts'
import Panel from './Panel.tsx'
import { cardPresentation } from './cardInstructions.ts'
import ProgramCard from './ProgramCard.tsx'

type RegisterPanelProps = {
  registers: Registers
  disabled: boolean
  submission: ClientGameState['submission']
  status: string
  error: string | null
  onRemove: (registerIndex: number) => void
  onConfirm: () => void
}

type RegisterSlotProps = {
  card: Card | null
  index: number
  disabled: boolean
  onRemove: (registerIndex: number) => void
}

// Renders one register slot.
function RegisterSlot({
  card,
  index,
  disabled,
  onRemove,
}: RegisterSlotProps) {
  const cardClassName = card
    ? 'register__card register__card--filled'
    : 'register__card'
  const registerIndex = card || disabled ? undefined : index

  return (
    <li className="register">
      <div className={cardClassName} data-register-index={registerIndex}>
        {card && (
          <ProgramCard
                  card={card}
                  size="register"
                  label={`${cardPresentation[card.instruction].label}, remove from register ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onRemove(index)}
                />
        )}
      </div>
      <span>{index + 1}</span>
    </li>
  )
}

// Renders the program registers.
function RegisterPanel({
  registers,
  disabled,
  submission,
  status,
  error,
  onRemove,
  onConfirm,
}: RegisterPanelProps) {
  return (
    <Panel className="register-panel">
      <h2 className="register-panel__heading">Registers</h2>
      <div className="game-status">
        <p role="status">{status}</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <ol className="registers">
        {registers.map((card, index) => (
          <RegisterSlot
            key={index}
            card={card}
            index={index}
            disabled={disabled}
            onRemove={onRemove}
          />
        ))}
      </ol>
      <button
        className="register-panel__done"
        type="button"
        disabled={!registersAreFilled(registers) || disabled}
        onClick={onConfirm}
      >
        {submission === 'pending' ? 'Submitting…'
          : submission === 'accepted' ? 'Confirmed'
            : submission === 'uncertain' ? 'Awaiting server' : 'Done'}
      </button>
    </Panel>
  )
}

export default RegisterPanel
