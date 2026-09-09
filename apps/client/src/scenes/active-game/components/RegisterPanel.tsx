import {
  registersAreFilled,
  type ProgramCard as Card,
  type Registers,
} from '../gameState.ts'
import Panel from './Panel.tsx'
import ProgramCard from './ProgramCard.tsx'

type RegisterPanelProps = {
  registers: Registers
  confirmed: boolean
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
            label={`${card.label}, remove from register ${index + 1}`}
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
  confirmed,
  onRemove,
  onConfirm,
}: RegisterPanelProps) {
  return (
    <Panel className="register-panel">
      <h2 className="register-panel__heading">Registers</h2>
      <ol className="registers">
        {registers.map((card, index) => (
          <RegisterSlot
            key={index}
            card={card}
            index={index}
            disabled={confirmed}
            onRemove={onRemove}
          />
        ))}
      </ol>
      <button
        className="register-panel__done"
        type="button"
        disabled={!registersAreFilled(registers) || confirmed}
        onClick={onConfirm}
      >
        {confirmed ? 'Confirmed' : 'Done'}
      </button>
    </Panel>
  )
}

export default RegisterPanel
