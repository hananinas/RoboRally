
```mermaid
    classDiagram
        direction LR

        class Game {
        +board: Board
        +players: Player[]
        -deck: Card[] unordered
        -dealCards()
        +gameLoop()
        }

        class Board {
        -tiles: Tile[][]
        -robots: Robot[]
        +moveRobot(Robot robot)
        -sortRobots()
        -execute()
        }

        class Tile {
            <<abstract>>
            +walls: Orientation[] set
            +robot: Robot
            +activate()
        }

        class Pit

        class Player {
        -robot: Robot
        -hand: Card[] unordered
        +assignProgram()
        }

        class Robot {
        -orientation: Orientation
        +tile: Tile
        +program: Card[] ordered
        }

        class Orientation {
        <<enumeration>>
        UP
        DOWN
        LEFT
        RIGHT
        }

        class Card {
            <<abstract>>
            +action()
        }

        class Move1
        class TurnLeft

        Game "1" *--> "0..1" Board
        Game *--> "1..*" Player
        Board "1" *-- "*" Tile

        Robot --> Orientation
        Tile <|-- Pit
        Tile --> "*" Orientation
        Tile "1" -- "0..1" Robot

        Player "1" --> "1" Robot

        Game  *--  Card
        Player  *--  Card
        Robot  *--  Card

        Card <|-- Move1
        Card <|-- TurnLeft
```

# Game

Responsible for dictating the game loop

# Board

Has the Tile grid and Robots \
(Not to be implemented in V0) Sorts robots based on the proximity antenna \
Executes robot programs \
Schedules tile activation

# Tile

Abstract class that gets extended with each obstacle type  \
Outlines what it's execution does.  \
To be called directly when it's the type that activates even when a robot isn't on it, like a laser firing across the map stopping at the first robot or wall.  \
Only Pit is to be implemented in V0.

# Robot 

Passes it's program from Player to Board.  \
Used to find the tiles that activate when robot is on them, like a conveyor belt that moves the robot.


# Player 

Has robot assigned  \
Responsible for assigning a Program to their Robot

# Cards

Abstract class that gets extended with each card  \
Cards are moves the robots can execute

Players have an unordered list/set of Card[] referred to as a hand (only a variable, not a class)  \
Game has an unordered list/set of Card[] referred to as a deck (only a variable, not a class)  \
Robot has an ordered list of Card[] referred to as a program (only a variable, not a class) 

# Orientation

Enum of orientations  \
Robot has simple orientation indicating where it's facing.  \
Tile has a set of Orientation[] indicating which sides have walls (useful for collision/path blocking detection).

Later some Tiles will also use it such as laser or conveyor belt (OrientedTile abstract class will extend tile with an additional orientation variable)


# Pseudocode to be used as inspiration for later implementations:

## Board:

```

for register
    board.getpriolist() -> []robots
        executeRegisters(robots)               (executes 1 register for each robot, they have new positions after this)
        for robot:
            resolveBoardActionPhase 1-4
        shootBoardLasers()
        for robot:
            resolveBoardActionPhase 7-8

```

## Laser obstacle:


```

activate()
    o = this.orientation
    recurse(this, o)
        if this.robot                       # 1: is there a robot on my tile?
            damage(robot)
            break
        if o in this.walls                  # 2: Does a wall block me from leaving this tile?
            break
        next_tile = board.getTile(o, 1)     # Get neighboiring tile in defined orientation, if edge of board is reached, board should fail this
        if ((o+2)%4) in next_tile.walls     # 3: Does a wall block me from entering next tile?
            break
        recurse(next_tile, o)               # 4: start over in next tile

```
