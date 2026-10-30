import './RobotPreview.css'

/** Decorative stand-in until robot choices and sprites are implemented. */
export default function RobotPreview() {
  return (
    <span className="robot-preview" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => <span className="robot-preview__layer" key={index} />)}
    </span>
  )
}
