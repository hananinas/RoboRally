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

## Start a playable game

As a player, I want to start with a board and a robot so that I can begin programming the robot immediately.

- A board is available when the game starts.
- The board consists of empty tiles.
- A robot is placed on the board.
- The robot has a position and a facing direction.

## Maintain the game state

As the game service, I want to keep track of the board and robot state so that each action can continue from the result of the previous action.

- The robot has a current position.
- The robot has a current facing direction.
- Changes to the robot become part of the current game state.

## Program the robot

As a player, I want to arrange and submit five programming cards in a chosen order so that I can decide what my robot will do during the activation phase.

- Five register positions are available.
- Each register contains either `Move 1` or `Turn Left`.
- The order of the five cards is clear before submission.
- The completed program can be submitted.

## Receive a program

As the game service, I want to receive the player's program so that I can execute the chosen actions during the activation phase.

- A program consists of five cards.
- The chosen card order is preserved.
- The received program is used for the next activation phase.

## Execute the programmed actions

As the game service, I want to execute the programmed actions in register order so that the robot follows the program selected by the player.

- Register 1 executes first and register 5 executes last.
- `Move 1` moves the robot one tile in the direction it is facing.
- `Turn Left` rotates the robot 90 degrees to the left.
- Each register uses the state resulting from the previous register.

## Show the current game state

As the game client, I want to present the current board and robot state so that the player can see what is happening in the game.

- The board is displayed as a grid.
- The robot is displayed on its current tile.
- The robot's facing direction is visible.
- Changes to the game state are reflected in the displayed board.

## Receive game changes

As the game client, I want to receive changes to the game state so that the displayed game stays up to date while the program executes.

- Robot movement is reflected in the client.
- Robot rotation is reflected in the client.
- Changes appear without manually reloading the page.

## Continue playing

As a player, I want to create another program after the current one has finished so that I can continue controlling the robot.

- After all five registers have executed, another programming phase begins.
- The robot keeps its resulting position and facing direction.
- The programming and activation cycle can continue repeatedly.