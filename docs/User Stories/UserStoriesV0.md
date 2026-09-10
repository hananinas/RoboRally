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

A full RoboRally round uses three phases:
- Upgrade
- Programming
- Activation
## Sprint for Game Setup and State
- **Start a playable game -** As a player, I want a game to start with a board and robot already initialised so that I can begin programming the robot immediately.
	- The game contains a board made from empty tiles.
	- The robot starts on a valid board tile.
	- The robot has a position and a facing direction.
	- The initial game state is available to the client.

- **See the robot's orientation -** As a player, I want the robot's facing direction to be part of the game state so that I can predict what a forward-move card will do.
	- The state distinguishes north, south, east, and west.
	- Rotating the robot changes its facing direction without changing its position.

- **Treat the server as the source of truth -** As a player, I want the game state to come from the game service so that what I see in the client matches what the game is actually executing.
	- The client does not resolve robot movement independently from the server.
	- A state update contains enough information to redraw the board and robot correctly.
## Sprint for Programming Phase
- **Program five registers -** As a player, I want to choose an action for each of five registers so that I can plan a sequence of robot movements for the round.
	- Exactly five register positions are presented in order from 1 to 5.
	- Each register can contain one of the two card types supported by v0.
	- The order in which cards are submitted is preserved by the game service.

- **Submit my program -** As a player, I want to send my programmed cards to the game service so that the robot can execute the plan I created.
	- The client can submit the ordered set of five cards through the defined game interface.
	- Unknown card types are rejected rather than executed.
	- A successfully accepted program is associated with the current activation cycle.

- **Know that my program was accepted -** As a player, I want clear feedback after submitting my cards so that I know the server will execute the sequence I intended.
	- The client can distinguish between an accepted program and a rejected program.
	- The submitted order remains visible while the program is being executed.
## Sprint for Activation Phase
- **Move forward -** As a player, I want a **Move 1** card to move my robot one tile in the direction it is facing so that forward movement behaves like RoboRally programming.
	- The robot moves exactly one tile for one Move 1 card.
	- The robot's orientation does not change when moving forward.
	- Movement is calculated from the robot's current orientation at the moment the card executes.

- **Turn left -** As a player, I want a **Turn Left** card to rotate my robot 90 degrees counter-clockwise so that I can change the direction of later movement cards.
	- The robot stays on the same tile.
	- North becomes west, west becomes south, south becomes east, and east becomes north.

- **Execute cards in register order -** As a player, I want my five programmed cards to execute from register 1 through register 5 so that the result matches the program I submitted.
	- Register 1 executes before register 2, and so on through register 5.
	- Each card uses the robot state produced by the previous register.
	- The server advances the active register after each card resolves.

- **Continue into the next round -** As a player, I want a new programming cycle to begin after register 5 so that I can keep playing.
	- After register 5 is resolved, the current program is finished.
	- The game returns to the programming state.
	- The robot keeps its resulting position and orientation.
	- The loop continues indefinitely; no checkpoint or victory condition ends the game.
## Sprint for State Broadcasting
- **Receive game-state changes -** As a player, I want the game service to push state changes to my client so that I can see the robot move and rotate as the program executes.
	- The client can subscribe to game-state updates.
	- A new state is broadcast whenever executing a register changes the game state.
	- The update identifies enough state to render the robot's latest position, orientation, and current register/phase.

- **Keep connected clients consistent -** As a player, I want connected clients to receive the same authoritative game state so that everyone observing the game sees the same result.
	- Clients receive state derived from the same server-side game instance.
	- A client applies server updates rather than inventing intermediate game outcomes locally.
## Sprint for React Client
- **See the board -** As a player, I want to see the board as a grid so that I can understand where the robot is located.
	- Empty board tiles are visibly represented.
	- The robot is rendered on the tile reported by the server.
	- The robot's facing direction is visually distinguishable.

- **Build and submit a program in the UI -** As a player, I want controls for placing Move 1 and Turn Left cards into the five registers so that I can program the robot without calling the service manually.
	- The UI exposes both card types.
	- The five register positions and their order are visible.
	- The player can submit the completed sequence to the game service.

- **See server updates without reloading -** As a player, I want the React client to apply incoming game-state updates automatically so that I can watch the activation sequence as it happens.
	- Incoming state updates update the existing board view.
	- The page does not need to be manually refreshed between registers or rounds.
	- The UI indicates whether the game is currently waiting for programming or executing a register.