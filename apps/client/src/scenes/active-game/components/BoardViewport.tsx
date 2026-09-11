// Reserves the full-page board layer.

import RobotSprite from "./RobotSprite"


function BoardViewport() {
  return <main className="board-viewport" aria-label="Game board"> 
  <RobotSprite x={50} y ={50} />
  </main>
}

export default BoardViewport
