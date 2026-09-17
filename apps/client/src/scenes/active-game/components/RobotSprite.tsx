type RobotDirection = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'

type RobotSpriteProps = {
  x: number
  y: number
  direction: RobotDirection
}

function directionToRotation(direction: RobotDirection): number {
  switch (direction) {
    case 'NORTH':
      return 0

    case 'EAST':
      return 90

    case 'SOUTH':
      return 180

    case 'WEST':
      return 270
  }
}

function RobotSprite({
  x,
  y,
  direction,
}: RobotSpriteProps) {
  const rotation = directionToRotation(direction)

  return (
    <div
      className="robot-sprite"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      aria-label="Robot"
    >
      <div
        className="robot-sprite__tank"
        style={{
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        }}
      >
        {/* Shadow */}
        <div className="robot-sprite__shadow" />

        {/* Tank tracks */}
        <div className="robot-sprite__track robot-sprite__track--left" />
        <div className="robot-sprite__track robot-sprite__track--right" />

        {/* Main body */}
        <div className="robot-sprite__body">
          {/* Turret */}
          <div className="robot-sprite__turret">
            <div className="robot-sprite__barrel" />
          </div>

          {/* Front indicator */}
          <div className="robot-sprite__front" />

          {/* Body detail */}
          <div className="robot-sprite__panel" />
        </div>
      </div>
    </div>
  )
}

export default RobotSprite