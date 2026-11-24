import { useState } from 'react'
import type { RobotDefinition } from '@robo-rally/game-events'
import RobotPreview from './RobotPreview.tsx'
import { robotOptionFor } from './robotPreviews.ts'
import './RobotPicker.css'

const PREVIEW_COLOURS = [
  { name: 'Blue', hex: '#4d8deb' },
  { name: 'Red', hex: '#e55f5f' },
  { name: 'Yellow', hex: '#ffc107' },
  { name: 'Green', hex: '#4caf70' },
  { name: 'Purple', hex: '#a67de0' },
  { name: 'Pink', hex: '#db79a8' },
] as const

type Props = {
  robots: readonly RobotDefinition[]
  selectedRobotId: string
  disabled: boolean
  onSelect: (robotSpriteId: string, color: string) => Promise<boolean>
}

export default function RobotPicker({ robots, selectedRobotId, disabled, onSelect }: Props) {
  const [selectedColor, setSelectedColor] = useState(PREVIEW_COLOURS[0].hex)
  
  const selectedRobot = robots.find((option) => option.id === selectedRobotId)
  const choices = robots
  const robot = selectedRobot && choices.some((option) => option.id === selectedRobot.id)
    ? selectedRobot
    : choices[0]
  const preview = robot ? robotOptionFor(robot.id) : undefined

  function chooseRobot(robotSpriteId: string) {
    if (!disabled && robotSpriteId !== robot?.id) void onSelect(robotSpriteId, selectedColor)
  }

  function chooseColor(colorHex: string) {
    if (!disabled) setSelectedColor(colorHex)
  }

  return (
    <div className="robot-picker">
      <header className="robot-picker__heading">
        <h2 className="entry-panel__eyebrow">Your robot</h2>
        <span className="robot-picker__tag">Preview</span>
      </header>
      <div className="robot-picker__stage" aria-hidden="true">
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
        {robot && preview && <RobotPreview sprite={preview.sprite} color={selectedColor} />}
      </div>
      <div aria-live="polite">
        <div className="robot-picker__selected">
          <h3>{robot?.name ?? 'No robot selected'}</h3>
          <p>Choose your robot</p>
        </div>
      </div>
      <div className="robot-picker__choices" role="group" aria-label="Choose a robot">
        {choices.map((option, choiceIndex) => {
          const selected = option.id === robot?.id
          return (
            <button
              className="robot-picker__choice"
              type="button"
              key={option.id}
              aria-label={`Robot option ${choiceIndex + 1}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => chooseRobot(option.id)}
            >
              <RobotPreview sprite={robotOptionFor(option.id).sprite} />
            </button>
          )
        })}
      </div>
      {robots.length === 0 && <p className="robot-picker__help">No robots are currently available.</p>}
      <fieldset className="robot-picker__colours">
        <legend>Player colour</legend>
        <div className="robot-picker__swatches">
          {PREVIEW_COLOURS.map((colour) => (
            <button
              className={`robot-picker__swatch robot-picker__swatch--${colour.name.toLowerCase()}`}
              type="button"
              key={colour.hex}
              aria-label={colour.name}
              aria-pressed={selectedColor === colour.hex}
              disabled={disabled}
              onClick={() => chooseColor(colour.hex)}
            >
              {selectedColor === colour.hex && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
