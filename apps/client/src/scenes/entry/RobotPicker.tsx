import { useState } from 'react'
import type { RobotDefinition } from '@robo-rally/game-events'
import './RobotPicker.css'

type Props = {
  robots: readonly RobotDefinition[]
  selectedRobotId: string
  disabled: boolean
  onSelect: (robotSpriteId: string) => Promise<boolean>
}

export default function RobotPicker({ robots, selectedRobotId, disabled, onSelect }: Props) {
  const [optimisticSelection, setOptimisticSelection] = useState<string | null>(null)
  const selected = optimisticSelection ?? selectedRobotId
  const robot = robots.find((option) => option.id === selected)

  function chooseRobot(robotSpriteId: string) {
    setOptimisticSelection(robotSpriteId)
    void onSelect(robotSpriteId).then(() => {
      setOptimisticSelection(null)
    })
  }

  return (
    <div className="robot-picker">
      <header className="robot-picker__heading">
        <h2 className="entry-panel__eyebrow">Your robot</h2>
        <span className="robot-picker__tag">Selected</span>
      </header>
      <div className="robot-picker__stage">
        <div className="robot-picker__platform">
          <span className="robot-picker__base" />
          <span className="robot-picker__top">
            <svg className="robot-picker__surface" viewBox="-94 -94 188 188" preserveAspectRatio="none">
              <g className="robot-picker__markings">
                <path d="M-23 -68 A72 72 0 0 1 23 -68 M68 -23 A72 72 0 0 1 68 23 M23 68 A72 72 0 0 1 -23 68 M-68 23 A72 72 0 0 1 -68 -23" />
              </g>
            </svg>
          </span>
        </div>
        {robot && <img className="robot-picker__icon" src={robot.icon} alt="" draggable={false} />}
      </div>
      <div className="robot-picker__selected">
        <h3>{robot?.name ?? 'No robot selected'}</h3>
        <p>Choose your robot</p>
      </div>
      <div className="robot-picker__choices" role="group" aria-label="Choose a robot">
        {robots.map((option) => (
          <button
            className="robot-picker__choice"
            type="button"
            key={option.id}
            aria-label={`${option.name} robot`}
            aria-pressed={option.id === selected}
            disabled={disabled}
            onClick={() => chooseRobot(option.id)}
          >
            <img className="robot-picker__icon" src={option.icon} alt="" draggable={false} />
            <span>{option.name}</span>
          </button>
        ))}
      </div>
      {robots.length === 0 && <p className="robot-picker__help">No robots are currently available.</p>}
    </div>
  )
}
