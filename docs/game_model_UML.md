
```mermaid
    classDiagram
        direction TD

        class Board {
        -Tile[][] matrix
        +moveRobot(Robot robot)
        }

        class Tile {
            <<abstract>>
            -Bool wall_N
            -Bool wall_E
            -Bool wall_S
            -Bool wall_W
            +Robot robot
            +performAction()
        }

        class ConveyorBelt{
            +performAction()
        }

        class Game {
        +Board board
        +Player[] players
        +Robot[] robots
        +setPlayers()
        +genBoard()
        +setRobots()
        +dealCards()
        +activationPhase()
        }

        class Player {
        -Robot robot
        +setProgram(Robot robot)
        }

        class Robot {
        -Orientation orientation
        -int health
        +Program program
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
            +execute()
        }

        class Hand {
            +Array Cards
        }

        class Program {
            +Stack Cards
        }

        class Move1
        class TurnLeft

        class Deck {
            +List Cards
        }

        class EmptyTile
        class ConveyorBelt


        Game --> Board
        Game --> Deck
        Game --> "2..8" Player
        Board "1" *-- "1..*" Tile


        Robot --> Orientation
        Tile <|-- ConveyorBelt
        Tile <|-- EmptyTile
        Tile --> Robot

        Program --> Robot

        Card "0..160" <-- Deck
        Card "0..9" <-- Hand
        Card "0..5" <-- Program
        
        Player --> Robot
        Player --> Hand

        Move1 --|> Card
        TurnLeft --|> Card
```

# Game

Responsible for game loop of
- Dealing out cards
- Executing submitted programs

# Board

Has the Tile grid

Responsible for Moving the robot

# Tile

Abstract class that gets extended with each obstacle type

Responsible for executing it's function on the robot

# Robot 

Keeps track of it's own health
To be extended later with the upgrades

# Player 

Has robot assigned

Responsible for assigning a Program to their Robot

# Cards

Abstract class that gets extended with each card

Cards are moves the robots can execute

Deck and Hand are unordered sets of cards while Program is a Stack of cards

# Orientation

Enum of orientations

Only Robot uses it right now, but later will be useful to have it separate since some
obstacles are also orientation dependent like conveyor belts

