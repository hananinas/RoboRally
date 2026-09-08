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
}

type RegisterSlotProps = {
  card: Card | null
  index: number
}

function RegisterSlot({ card, index }: RegisterSlotProps) {
  const cardClassName = card
    ? 'register__card register__card--filled'
    : 'register__card'

  return (
    <li className="register">
      <div className={cardClassName}>
        {card && <ProgramCard card={card} size="register" />}
      </div>
      <span>{index + 1}</span>
    </li>
  )
}

function RegisterPanel({ registers, confirmed }: RegisterPanelProps) {
  return (
    <Panel className="register-panel">
      <h2 className="register-panel__heading">Registers</h2>
      <ol className="registers">
        {registers.map((card, index) => (
          <RegisterSlot key={index} card={card} index={index} />
        ))}
      </ol>
      <button
        className="register-panel__done"
        type="button"
        disabled={!registersAreFilled(registers) || confirmed}
      >
        {confirmed ? 'Confirmed' : 'Done'}
      </button>
    </Panel>
  )
}

export default RegisterPanel
