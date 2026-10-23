
# User stories
> “As a \[role\], I want \[goal\] so that \[reason\].”

## V0

### Start a playable game

As a player, I want to start with a board and a robot so that I can begin programming the robot immediately.

- A board is available when the game starts.
- The board consists of empty tiles.
- A robot is placed on the board.
- The robot has a position and a facing direction.

### Maintain the game state

As the game service, I want to keep track of the board and robot state so that each action can continue from the result of the previous action.

- The robot has a current position.
- The robot has a current facing direction.
- Changes to the robot become part of the current game state.

### Program the robot

As a player, I want to arrange and submit five programming cards in a chosen order so that I can decide what my robot will do during the activation phase.

- Five register positions are available.
- Each register contains either `Move 1` or `Turn Left`.
- The order of the five cards is clear before submission.
- The completed program can be submitted.

### Receive a program

As the game service, I want to receive the player's program so that I can execute the chosen actions during the activation phase.

- A program consists of five cards.
- The chosen card order is preserved.
- The received program is used for the next activation phase.

### Execute the programmed actions

As the game service, I want to execute the programmed actions in register order so that the robot follows the program selected by the player.

- Register 1 executes first and register 5 executes last.
- `Move 1` moves the robot one tile in the direction it is facing.
- `Turn Left` rotates the robot 90 degrees to the left.
- Each register uses the state resulting from the previous register.

### Show the current game state

As the game client, I want to present the current board and robot state so that the player can see what is happening in the game.

- The board is displayed as a grid.
- The robot is displayed on its current tile.
- The robot's facing direction is visible.
- Changes to the game state are reflected in the displayed board.

### Receive game changes

As the game client, I want to receive changes to the game state so that the displayed game stays up to date while the program executes.

- Robot movement is reflected in the client.
- Robot rotation is reflected in the client.
- Changes appear without manually reloading the page.

### Continue playing

As a player, I want to create another program after the current one has finished so that I can continue controlling the robot.

- After all five registers have executed, another programming phase begins.
- The robot keeps its resulting position and facing direction.
- The programming and activation cycle can continue repeatedly.


## V1

### V1-01 - Register as a user

As a user, I want to create an account, so that I can participate under a recognized identity.

### V1-02 - Prepare a shared game

As a player, I want to join a lobby and see the game setup, so that I can start a game with other participants.

### V1-03 - Control my own robot

As a player, I want to program my own robot independently, so that my decisions determine its actions.

### V1-04 - Resolve a shared round

As a player, I want all participants to observe the same resolved actions, so that we play a consistent shared game.

### V1-05 - Push other robots

As a player, I want my robot to push another robot, so that my movement can affect another player's position.

### V1-06 - Navigate board effects

As a player, I want conveyor belts and gears to affect my robot, so that I must account for board elements when programming.

### V1-07 - Resolve falls consistently

As a player, I want pits and board edges to have consistent consequences, so that I can anticipate the risks of movement and pushing.

### V1-08 - Track checkpoint progress

As a player, I want to see my robot's checkpoint progress, so that I can plan my route through the racing course.


## V2

