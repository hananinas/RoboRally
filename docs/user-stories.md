
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

### V1-05 - Navigate walls and obstacles

As a player, I want walls to block my robot's movement, so that I must plan my route around obstacles on the board.

### V1-06 - Resolve falls consistently

As a player, I want pits and board edges to have consistent consequences, so that I can anticipate the risks of movement.

### V1-07 - Track checkpoint progress

As a player, I want to see my robot's checkpoint progress, so that I can plan my route through the racing course.


## V2

### Implemented

#### V2-01 - Win the race

As a player, I want the game to end when a robot reaches the final checkpoint, so that the winner is clearly determined and visible to everyone.

Implemented scope: the game end is shown on the board instead of in a popup. The camera moves to the winning robot, which celebrates on the final checkpoint; a banner names the winner, final standings rank everyone by checkpoints collected, and players can keep looking at the board until they choose to leave.

#### V2-04 - Sign up and log in

As a user, I want to register and log in using an external identity provider, so that I can participate under my own authenticated identity.

#### V2-05 - Pick a game and board

As a player, I want to configure my game, so that I can play how I like.

Implemented scope: choosing a board and naming a lobby.

#### V2-08 - Browse available games

As a user, I want to see a list of available games to join, so that I can choose which game to play.

### Moved to V3

These stories were moved to V3, including the remaining work on partially implemented stories. Their original V2 IDs are retained for reference.

#### V2-02 - Board effects and push

As a player, I want conveyor belts and robot pushing to affect robot positions consistently, so that I can predict how my robot interacts with the board and other players.

Robot pushing is implemented; conveyor movement is still missing.

#### V2-03 - Interactive commands

As a player, I want to choose the effect of interactive commands during activation, so that I can make decisions that influence my robot's actions.

#### V2-06 - Resume a saved game

As a player, I want to resume a saved game after a server restart, so that I can continue playing without losing my progress.

#### V2-07 - Game animations

As a player, I want to see robot movements, rotations, and board effects animated, so that I can more easily follow what happens during each register.

Robot movement, rotation, and pushing are animated; conveyor and other board-effect animations are still missing.


## V3

### V3-01 - Rotate on gears

As a player, I want gears to rotate my robot at the appropriate point during activation, so that I can account for board-driven changes in direction when programming my robot.

### V3-02 - Choose the number of players

As a player, I want to set the minimum and maximum number of players when creating a game, so that I can control the size of the game and when it is ready to start.

### V3-03 - See game statuses

As a user, I want to see whether each available game is open, started, or finished, so that I can understand its status before deciding which game to join or view.

### V3-04 - Add boards without programming

As a game maintainer, I want to add new boards through board definitions without changing application code, so that I can expand the available courses without programming each board.

### V3-05 - Resolve SPAM damage

As a player, I want damage to add SPAM cards to my discard pile and programmed SPAM cards to be replaced by commands drawn from my programming deck, so that damage affects the predictability of my robot's actions.

### V3-06 - Resolve additional damage types

As a player, I want WORM, TROJAN HORSE, and VIRUS cards to apply their distinct damage effects, so that different hazards create different consequences for my robot and nearby robots.

### V3-07 - Resolve laser fire

As a player, I want board lasers and robot lasers to deal damage while respecting walls and intervening robots, so that I can plan around firing lines during activation.

### V3-08 - Collect and track energy

As a player, I want to collect energy cubes from energy fields and see my current energy, so that I can plan how to gather resources for upgrades.

### V3-09 - Activate fields on specific registers

As a player, I want board elements marked for specific registers to activate only on those registers, so that I can time my robot's movements around their effects.

### V3-10 - Draw cards when programming times out

As a player, I want empty registers to be filled from my own programming deck when the programming timer expires, so that an unfinished program follows the same deck rules as the rest of the game.

### V3-11 - Choose my robot and colour

As a player, I want to choose an available robot figure and colour before the game starts, so that I can personalise my robot and recognise it on the board.

### V3-12 - Limit game visibility

As a player, I want to restrict who can discover and join a game I create, so that I can organise a game with my intended participants.

### V3-13 - Watch a game

As a user, I want to view the public state of a game I am allowed to watch, so that I can follow the race without accessing players' private hands or unrevealed commands.

### V3-14 - Delete my account

As a user, I want to delete my account, so that I can stop participating and remove my registered identity from the service.

### V3-15 - Choose how activation is shown

As a player, I want to choose between following individual command and field-action steps or advancing automatically until a decision is needed, so that I can follow the game at a comfortable pace.

### V3-16 - Buy and use upgrades

As a player, I want to spend collected energy on supported permanent and temporary upgrades, so that I can change my robot's abilities and develop a strategy beyond movement alone.

### V3-17 - Create custom boards

As a player, I want to create and save boards in a visual editor, so that I can design my own courses and use them in games.

### V3-18 - Review finished games

As a user, I want to view the final state and replay the actions of a finished game I am allowed to access, so that I can revisit the race and learn from previous decisions.
