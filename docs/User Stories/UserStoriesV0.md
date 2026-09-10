**What does v0 need:**
- Create Game Service
	- Board model (containing objects) with empty tiles
	- Robot model
	- Card model (2 implementations $\leftarrow$ and $\uparrow$)
	- Endless gameloop
- Define interface
	- Passing cards
	- Broadcast changes to client
- React client
	- Render board with state
	- Apply received state to view
	- General layout
- Compile rules for v.0

# User stories
> “As a \[role\], I want \[goal\] so that \[reason\].”

For v0, the infinite game loop is:
Programming → Activation → Programming → ...

## Game Setup

### Start a game
As a player, I want to start with a board and a robot so that I can begin
programming immediately.

- A board is available when the game starts.
- The board consists of empty tiles.
- A robot is placed on the board.
- The robot has a position and a facing direction.

### Keep track of the game state
As the game service, I want to maintain the current board and robot state so
that the game can continue from the result of previous actions.

- The robot's current position is stored.
- The robot's current facing direction is stored.
- Changes made while executing cards become the new game state.

## Programming Phase

### Create a five-card program
As a player, I want to arrange five cards in order so that I can decide what
my robot will do during the activation phase.

- There are five register positions.
- Each register contains either Move 1 or Turn Left.
- The order of the five cards is clear before the program is submitted.

### Receive a program
As the game service, I want to receive the player's five-card program so that
I can execute it during the activation phase.

- Five cards can be received from the client.
- The order chosen by the player is preserved.
- The received program is used for the next activation phase.

## Activation Phase

### Move the robot forward
As a player, I want Move 1 to move my robot forward one tile so that the
robot follows the program I created.

- The robot moves one tile in the direction it is facing.
- Its facing direction does not change.

### Turn the robot left
As a player, I want Turn Left to rotate my robot left so that I can change
the direction of later movement.

- The robot rotates 90 degrees to the left.
- The robot remains on the same tile.

### Execute my program in order
As a player, I want my cards to execute in register order so that the outcome
matches the sequence I programmed.

- Register 1 executes first and register 5 executes last.
- Each card acts on the result of the previous card.
- All five registers are executed during the activation phase.

### Continue playing
As a player, I want to create another program after my current program has
finished so that I can continue controlling the robot.

- After register 5, a new programming phase begins.
- The robot keeps its current position and facing direction.
- The programming and activation cycle can continue repeatedly.

## Game State Updates

### Receive changes to the game
As the game client, I want to receive changes to the game state so that the
display stays synchronized with the running game.

- Changes are received while a program is being executed.
- The latest robot position and facing direction are available to the client.
- The client can update its view when the state changes.

## Client

### See the board and robot
As a player, I want to see the board and my robot so that I can understand
the current game state.

- The board is displayed as a grid.
- The robot is displayed on its current tile.
- The direction the robot is facing is visible.

### Program the robot using the client
As a player, I want to choose Move 1 and Turn Left cards in the client so
that I can program the robot without interacting with the game service
directly.

- Move 1 and Turn Left are available to choose.
- Five register positions are visible.
- The completed five-card program can be submitted.

### Watch the program execute
As a player, I want the board to update while my program executes so that I
can see the result of each action.

- The robot's displayed position changes when it moves.
- The robot's displayed direction changes when it turns.
- Updates appear without manually reloading the page.