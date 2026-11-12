import { useState } from 'react'
import RobotPreview from './RobotPreview.tsx'
import { robotOptions } from './robotPreviews.ts'
import './RobotPicker.css'

export default function RobotPicker() {
  const [selected, setSelected] = useState(0)
  const robot = robotOptions[selected]

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
        {robotOptions.map((option, index) => (
          <button
            className="robot-picker__choice"
            type="button"
            key={option.name}
            aria-label={`${option.name} robot`}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
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
