import type { RobotDefinition } from '@robo-rally/game-events'
import RobotPreview from './RobotPreview.tsx'
import { robotOptionFor } from './robotPreviews.ts'
import './RobotPicker.css'

type Props = {
  robots: readonly RobotDefinition[]
  selectedRobotId: string
  selectedColorIndex?: number
  takenColorIndices: number[]
  colorPalette: readonly string[]
  disabled: boolean
  onSelect: (robotSpriteId: string, colorIndex?: number) => Promise<boolean>
}

export default function RobotPicker({ robots, selectedRobotId, selectedColorIndex, takenColorIndices, colorPalette, disabled, onSelect }: Props) {
  const selectedRobot = robots.find((option) => option.id === selectedRobotId)
  const choices = robots
  const robot = selectedRobot && choices.some((option) => option.id === selectedRobot.id)
    ? selectedRobot
    : choices[0]
  const preview = robot ? robotOptionFor(robot.id) : undefined
  
  const displayColorIndex = selectedColorIndex ?? 0
  const displayColor = colorPalette[displayColorIndex] ?? colorPalette[0]

  function chooseRobot(robotSpriteId: string) {
    if (!disabled && robotSpriteId !== robot?.id) void onSelect(robotSpriteId, displayColorIndex)
  }

  function chooseColor(colorIndex: number) {
    if (!disabled && !takenColorIndices.includes(colorIndex)) {
      if (robot) void onSelect(robot.id, colorIndex)
    }
  }

  const isColorTaken = (colorIndex: number) => takenColorIndices.includes(colorIndex)

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
        {robot && preview && <RobotPreview sprite={preview.sprite} color={displayColor} />}
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
      <fieldset className="robot-picker__colours" disabled={disabled}>
        <legend>Player colour</legend>
        <div className="robot-picker__swatches">
          {colorPalette.map((hex, colorIndex) => {
            const taken = isColorTaken(colorIndex)
            const colorName = ['Blue', 'Red', 'Yellow', 'Green', 'Purple', 'Pink'][colorIndex] ?? `Color ${colorIndex}`
            return (
              <button
                className="robot-picker__swatch"
                type="button"
                key={hex}
                aria-label={colorName}
                aria-pressed={displayColorIndex === colorIndex}
                disabled={disabled || taken}
                onClick={() => chooseColor(colorIndex)}
                title={taken ? 'This color is already taken by another player' : ''}
                style={{ backgroundColor: hex }}
              >
                {displayColorIndex === colorIndex && <span aria-hidden="true">✓</span>}
                {taken && <span className="robot-picker__swatch-unavailable" aria-hidden="true">✕</span>}
              </button>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}
