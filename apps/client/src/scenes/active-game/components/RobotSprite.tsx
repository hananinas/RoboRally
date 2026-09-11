type RobotSpriteProps = {
    x: number
    y: number
    
  }

function RobotSprite({x, y}: RobotSpriteProps) {
    return (
        <div
      className="robot-sprite"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      aria-label="Robot"
    >
      <div className="robot-sprite__shadow" />

      <div className="robot-sprite__body">
        <div className="robot-sprite__head">
          <div className="robot-sprite__antenna" />
          <div className="robot-sprite__eye robot-sprite__eye--left" />
          <div className="robot-sprite__eye robot-sprite__eye--right" />
        </div>

        <div className="robot-sprite__chest" />
      </div>
    </div>

    )
}

export default RobotSprite