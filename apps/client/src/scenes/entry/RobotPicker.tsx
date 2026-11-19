import { ROBOT_SPRITE_IDS, type RobotDefinition } from '@robo-rally/game-events'
import RobotPreview from './RobotPreview.tsx'
import { robotOptionFor } from './robotPreviews.ts'
import './RobotPicker.css'

const PREVIEW_COLOURS = ['Blue', 'Red', 'Yellow', 'Green', 'Purple', 'Pink'] as const

type Props = {
  robots: readonly RobotDefinition[]
  selectedRobotId: string
  disabled: boolean
  onSelect: (robotSpriteId: string) => Promise<boolean>
}

export default function RobotPicker({ robots, selectedRobotId, disabled, onSelect }: Props) {
  const tank = robots.find((option) => option.id === ROBOT_SPRITE_IDS[0])
  const selectedRobot = robots.find((option) => option.id === selectedRobotId)
  const availableRobots = tank
    ? [tank, ...robots.filter((option) => option.id !== tank.id).slice(0, 5)]
    : robots.slice(0, 6)
  const choices = selectedRobot && !availableRobots.some((option) => option.id === selectedRobot.id)
    ? [...availableRobots.slice(0, 5), selectedRobot]
    : availableRobots
  const robot = selectedRobot && choices.some((option) => option.id === selectedRobot.id)
    ? selectedRobot
    : choices[0]
  const preview = robot ? robotOptionFor(robot.id) : undefined

  function chooseRobot(robotSpriteId: string) {
    if (!disabled && robotSpriteId !== robot?.id) void onSelect(robotSpriteId)
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
        {robot && preview && <RobotPreview sprite={preview.sprite} />}
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
      <fieldset className="robot-picker__colours" disabled aria-describedby="robot-picker-help">
        <legend>Player colour</legend>
        <div className="robot-picker__swatches">
          {PREVIEW_COLOURS.map((colour) => (
            <button
              className={`robot-picker__swatch robot-picker__swatch--${colour.toLowerCase()}`}
              type="button"
              key={colour}
              aria-label={colour}
              aria-pressed={colour === PREVIEW_COLOURS[0]}
            >
              {colour === PREVIEW_COLOURS[0] && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="robot-picker__help" id="robot-picker-help">Player colour selection coming soon.</p>
    </div>
  )
}
