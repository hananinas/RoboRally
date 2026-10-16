This UML Class diagram is to be used for internal development purposes. Such as planning what needs to be implemented and how. \
Will update with a more conceptual domain diagram which will be used for presentations highlighting parts of the model.

```mermaid
    classDiagram
        direction LR

        class Game {
        +board: Board
        +players: Player[]
        -phase: GamePhase
        -currentRegister: int
        -activatedRobotIds: RobotId[] set
        -deck: Card[] unordered
        -dealCards()
        +submitProgram(PlayerId playerId, Card[5] program)
        +executeCurrentRegister()
        -nextRobotByPriority() RobotId
        -executeCard(RobotId robotId, Card card)
        }

        class Board {
        -tiles: Tile[][]
        -robotPositions: Map
        +positionOf(RobotId robotId) Position
        +occupantAt(Position position) RobotId?
        +moveRobot(RobotId robotId, Direction direction, int steps) MovementResult
        }

        class Tile {
            <<abstract>>
            +walls: Direction[] set
            +checkpointNumber: int?
        }

        class EmptyTile

        class Player {
        -robot: Robot
        -hand: Card[] unordered
        +lastCheckpoint: int
        +completeCheckpoint(int number) bool
        }

        class Robot {
        +id: RobotId
        -direction: Direction
        +program: Card[5] ordered
        +setProgram(Card[5] program)
        +getProgramCard(int registerIndex) Card
        +turn(int quarterTurns)
        }

        class Direction {
        <<enumeration>>
        NORTH
        EAST
        SOUTH
        WEST
        }

        class Card {
            +id: CardId
            +instruction: Instruction
        }

        Game "1" *--> "1" Board
        Game *--> "1..*" Player
        Board "1" *-- "1..*" Tile

        Robot --> Direction
        Tile <|-- EmptyTile

        Player "1" --> "1" Robot

        Game "1" --> "*" Card : deck
        Player "1" --> "*" Card : hand
        Robot "1" --> "5" Card : program

```

# Game

Responsible for dictating the game loop: dealing cards, taking programs, and executing their registers.

Keeps track of the current phase and register. `submitProgram()` checks a player's five cards before assigning them to their Robot. During activation, Game chooses the next robot from those that have not acted yet, using current positions on Board and the priority antenna. It reads that robot's card and applies it: movement goes through Board, while turns change Robot's direction. Priority is worked out again after each robot acts.

Board elements activate after the robot actions in each register. Game reads each remaining robot's final tile and asks its Player to complete that checkpoint. Player advances only to the next numbered checkpoint. Passing over one during movement does not count. This also runs when removing a player finishes a register. After the fifth register, Game returns to programming, preserving checkpoint progress; completing the course does not end the game.

# Board

Has the Tile grid and keeps track of each Robot's position in a map from RobotId to Position. Tile and Robot do not hold references to one another.

Answers position and occupancy queries, and carries out movement. Board checks walls, board edges, and other robots before moving anything; pushing other robots can be resolved here later. Game reads Board positions and antenna state to work out priority, but Board does not sort robots or execute their programs.

# Tile

Abstract class describing what is on a board space. Walls are properties of any Tile, not a separate tile type. EmptyTile is currently the only tile type shown for V0.

An optional `checkpointNumber` is another Tile property. A positive number identifies a checkpoint; absence means no checkpoint. Board owns its position through the tile grid, validates unique consecutive numbering from 1, and derives the checkpoint count. Checkpoints do not require a separate tile subclass and can coexist with walls.

Tiles do not hold robots or activate themselves. Game can schedule board effects later, with Board handling the spatial checks needed to find what they affect.

# Robot

Has an ID, its direction, and an ordered program of five cards. Game assigns the program through `setProgram()` and reads the card for each register. Robot does not know its position or which Tile it occupies.

# Player

Has an assigned Robot and an unordered hand of cards. A five-card program is submitted through Game rather than assigned directly to Robot.

# Cards

Each Card has an instance ID and an Instruction. The shared instruction catalog defines movement distances and quarter turns, and its keys define the Instruction type. Game interprets these effects through Board and Robot. Cards describe actions rather than executing themselves.

The client keeps labels and icons in one presentation map and uses the shared effect kind to choose animation timing.

A Player's hand and Game's deck are unordered Card collections. A Robot's program is an ordered list of five Cards. These are properties, not separate classes.

# Direction

Enum of `NORTH`, `EAST`, `SOUTH`, and `WEST` (cardinal indicating global/non-local directions). `Robot.direction` indicates where it faces (therefore a direction rather than an orientation). `Tile.walls` is a set of Directions indicating which sides have walls. Board checks both sides of a tile boundary when moving a robot or tracing a laser.

Later, directional board elements such as lasers or conveyor belts can use Direction too.


# Pseudocode to be used as inspiration for later implementations:

## Register execution:

```
game.startActivationPhase()                     # currentRegister = 0
while game.currentRegister < 5:
    remaining = game.getActiveRobotIds()
    while remaining is not empty:
        robotId = game.getNextRobot(remaining)    # Uses current Board positions and antenna
        card = robot(robotId).getProgramCard(game.currentRegister)
        game.executeCard(robotId, card)           # Movement via Board, turning via Robot
        remaining.remove(robotId)                 # Priority is checked again for the next robot
    game.activateBoardElements()                  # Check final tiles for ordered checkpoints
    game.finishRegister()                         # Advance to the next register
game.finishRound()                                # Return to programming phase
```

## Laser obstacle:

```
game.activateBoardElements():                     # Later; no-op in V0
    for each (position, laser) on board:
        hit = board.firstRobotHit(position, laser.direction)
        if hit exists:
            game.damageRobot(hit)

board.firstRobotHit(position, direction):
    while board.isInBounds(position):
        if robotId = board.occupantAt(position):
            return robotId
        next = board.getNeighbour(position, direction)
        if not board.isInBounds(next):
            return none
        if board.hasWallBetween(position, direction):  # Wall on either side blocks the laser
            return none
        position = next
    return none
```

## Robot priority (TypeScript reference implementation):

The antenna is passed explicitly because the current Board model does not store it yet. Its `angle` is in radians from east; with board coordinates increasing south, positive angles rotate clockwise. Call this again after each robot acts, using only robots that have not activated in the current register. Exact ties keep the first ID in `remaining`.

```ts
type RobotId = string
type Position = Readonly<{ x: number; y: number }>
type Antenna = Readonly<Position & { angle: number }>
type BoardPositions = { positionOf(robotId: RobotId): Position }

function nextRobotByPriority(
  remaining: readonly RobotId[],
  board: BoardPositions,
  antenna: Antenna,
): RobotId {
  if (remaining.length === 0) {
    throw new RangeError('No robots remain to activate')
  }

  const fullTurn = 2 * Math.PI
  const score = (id: RobotId): readonly [number, number] => {
    const position = board.positionOf(id)
    const distance = Math.abs(position.x - antenna.x) + Math.abs(position.y - antenna.y)
    const angle = Math.atan2(position.y - antenna.y, position.x - antenna.x)
    const offset = ((angle - antenna.angle) % fullTurn + fullTurn) % fullTurn
    return [distance, offset]
  }

  return remaining.reduce((best, id) => {
    const [distance, offset] = score(id)
    const [bestDistance, bestOffset] = score(best)
    return distance < bestDistance || (distance === bestDistance && offset < bestOffset)
      ? id
      : best
  })
}
```
