import { useState } from 'react'
import type { RobotSpriteId } from '@robo-rally/game-events'
import RobotPreview from './RobotPreview.tsx'
import { robotOptionFor, robotOptions } from './robotPreviews.ts'
import './RobotPicker.css'

type Props = {
  selectedRobotId: RobotSpriteId
  disabled: boolean
  onSelect: (robotSpriteId: RobotSpriteId) => Promise<boolean>
}

export default function RobotPicker({ selectedRobotId, disabled, onSelect }: Props) {
  const [optimisticSelection, setOptimisticSelection] = useState<RobotSpriteId | null>(null)
  const selected = optimisticSelection ?? selectedRobotId
  const robot = robotOptionFor(selected)

  function chooseRobot(robotSpriteId: RobotSpriteId) {
    setOptimisticSelection(robotSpriteId)
    void onSelect(robotSpriteId).then(() => {
      setOptimisticSelection(null)
    })
  }

  return (
    <div className="robot-picker">
      <header className="robot-picker__heading">
        <h2>Your robot</h2>
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
        <RobotPreview sprite={robot.sprite} color={robot.color} />
      </div>
      <div className="robot-picker__selected">
        <h3>{robot.name}</h3>
        <p>Choose your robot</p>
      </div>
      <div className="robot-picker__choices" role="group" aria-label="Choose a robot">
        {robotOptions.map((option) => (
          <button
            className="robot-picker__choice"
            type="button"
            key={option.id}
            aria-label={`${option.name} robot`}
            aria-pressed={option.id === selected}
            disabled={disabled}
            onClick={() => chooseRobot(option.id)}
          >
            <RobotPreview sprite={option.sprite} color={option.color} />
            <span>{option.name}</span>
          </button>
        ))}
      </div>
      <p className="robot-picker__help">Six additional robot designs are placeholders.</p>
    </div>
  )
}
