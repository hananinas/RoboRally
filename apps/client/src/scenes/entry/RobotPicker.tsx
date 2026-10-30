import RobotPreview from './RobotPreview.tsx'
import './RobotPicker.css'

const PREVIEW_MODELS = ['Tank', 'Model 02', 'Model 03', 'Model 04'] as const
const PREVIEW_COLOURS = ['Blue', 'Red', 'Yellow', 'Green', 'Purple', 'Pink'] as const

/** Presentational only: selection and readiness are separate feature work. */
export default function RobotPicker() {
  return (
    <div className="robot-picker">
      <header className="robot-picker__heading">
        <h2>Your robot</h2>
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
        <RobotPreview model="tank" />
      </div>
      <div className="robot-picker__carousel">
        <button className="robot-picker__arrow" type="button" disabled aria-label="Previous robot model" title="Robot selection is coming soon.">‹</button>
        <div>
          <h3>{PREVIEW_MODELS[0]}</h3>
          <p>01 / {String(PREVIEW_MODELS.length).padStart(2, '0')}</p>
        </div>
        <button className="robot-picker__arrow" type="button" disabled aria-label="Next robot model" title="Robot selection is coming soon.">›</button>
      </div>
      <ol className="robot-picker__positions" aria-label="Robot model previews">
        {PREVIEW_MODELS.map((model, index) => (
          <li key={model}>
            <button type="button" aria-label={model} aria-pressed={index === 0} disabled />
          </li>
        ))}
      </ol>
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
      <p className="robot-picker__help" id="robot-picker-help">Robot and colour selection coming soon.</p>
    </div>
  )
}
