# Communication
The Client and Game Service use Socket.IO to communicate with each other. 
Client requests receive acknowledgement callbacks. Game state changes and gameplay updates are delivered as events.

This document describes the v0.5 communication flow. [AsyncAPI](asyncapi.yaml) defines the exact payloads and rejection codes, with a [rendered reference](asyncapi.html).


## Login and joining
The client logs in with a username and receives a user ID.

The client first logs in with a username:

`user.login`

A successful login returns:

`LOGGED_IN {user}`

The client then sends:

`game.join {gameId}`

on the same socket for the configured game.

A successful join returns:

`JOINED {assignment, state, hand, programSubmitted}`

The acknowledgement contains the player's current robot assignment, public game state, private hand, and program-submission status. The client must apply all JOINED data before processing later live game events. A future lobby may be inserted between login and joining without changing this model.

### Membership

New players may join a game until the server accepts the first program submission. Accepting that submission starts the game and permanently closes joining to new players. Later attempts by new players receive GAME_ALREADY_STARTED. 

In case of disconnection, existing members may reconnect at any time. If the tab is left open SocketIO will automatically try to reestablish the connection. In case of a closed tab, the player can reopen the webpage in another tab to reconnect. In case multiple tabs are used, the first connection to reclaim a disconnected membership becomes its owner. A later connection cannot replace that owner, even if its Socket.IO session was successfully recovered. 

When an existing member sends game.join while not being connected, the server attaches the new connection to the existing player and robot and returns their current assignment and state through JOINED.

If another connection attempts to join the same game for that user, it receives:

`USER_ALREADY_IN_GAME`

A failed join leaves the user logged in and the client may attempt another join later.

An explicit `game.leave {gameId}` removes the owning connection's player and robot, frees the occupied tile, and revokes its public/private room access. `LEFT` retains login. Remaining members receive `game.playerLeft {gameId, playerId, robotId}`. A disconnected player remains a member; disconnecting is not leaving. Leaving does not reopen a game that has already started.

Reconnection behavior is described in the Reconnection section.

The following diagram documents the initial join behaviour:

```mermaid
sequenceDiagram
    participant Client
    participant Server as Game Service
    participant Public as game:{gameId}:public
    participant Others as Existing members

    Client->>Server: user.login {username}
    alt Valid username
        Server-->>Client: Acknowledgement: LOGGED_IN {user}
        Client->>Server: game.join {gameId}
        alt Join accepted
            Server-->>Client: Acknowledgement: JOINED {assignment, state, hand, programSubmitted}
            Server->>Public: game.playerJoined {player, robot}
            Public-->>Others: game.playerJoined {player, robot}
            Note over Client,Server: Initialize before later game events
        else Join rejected
            Server-->>Client: Acknowledgement: rejection outcome
        end
    else Invalid username
        Server-->>Client: Acknowledgement: INVALID_USERNAME
    end
```


## Game has started
### Programming

During the programming phase, each player submits five distinct card IDs in register order for the current round.

The client sends:

`program.submit {gameId, playerId, cardIds}`

The service verifies that the submitted cards belong to the player and that the submission is valid for the current game phase.

A successful submission receives:

`ACCEPTED`

The server then emits:

`program.submitted {playerId}`

to the game's public room.

This informs other players that the player has submitted their program without revealing the submitted cards. The server waits until all players have successfully submitted before beginning activation.


### Submission failures

A submission can be rejected for a mismatched or malformed request, because the connection is not a member of the game, because the round has already moved past programming, because the player already has a stored program for this round, because the game is paused, or because of an unexpected service failure. See [AsyncAPI](asyncapi.yaml) for the exact rejection codes.

A rejected submission does not replace or modify the player's current program.

If the client receives no acknowledgement, the outcome is unknown. The client must not automatically resend the submission because the original request may have been accepted.


### Activation

Once all players have submitted, the service resolves the five registers in order. Within each register, eligible robots act according to antenna priority. Priority is recalculated after each robot action before the next robot acts.

Each resolved action is emitted publicly as:

`robot.actionResolved`

Clients must process resolved actions in the order in which they are received.

#### Activation ordering

The antenna is located at the top centre of the board and faces south.

The test board uses:

- position (10, 0)
- direction Math.PI / 2

The antenna does not occupy a robot tile.

Exact priority ties are resolved using player join order. The priority algorithm defines the complete robot action order.

If an unexpected service failure makes gameplay unrecoverable, members receive `game.aborted {gameId}` and the game ends permanently.

### Checkpoint progress (proposal; approval required)

Checkpoint progress belongs to the player. Public `PlayerState` includes `lastCheckpoint`, initially 0, and `PublicGameState` includes `checkpointCount`, the total number of checkpoints on the board. JOINED supplies both values for initialization and reconnection. `game.playerJoined` supplies the new player's initial progress to existing members.

When a player's checkpoint progress changes, the service broadcasts:

`player.checkpointProgress {gameId, playerId, lastCheckpoint, checkpointCount}`

to `game:{gameId}:public`. The values are authoritative integers with `0 <= lastCheckpoint <= checkpointCount`. Progress records the last checkpoint completed in numerical order and persists across rounds and reconnections. Clients cannot award progress or request a checkpoint change.

The broadcast follows the related `robot.actionResolved`, or `game.playerLeft` when a departure completes a register, and precedes subsequent actions or private hands. Only remaining players receive gameplay broadcasts. No progress event is emitted when progress is unchanged.

The client displays `lastCheckpoint/checkpointCount` for its assigned player, starting at `0/x`; a board without checkpoints shows `0/0`. It applies broadcasts on receipt, independently of queued movement animations. Ignore other games, unknown or removed players, and duplicate or older progress values. Successful Socket.IO recovery replays missed progress events; failed recovery replaces progress from the new JOINED snapshot.

Progress broadcasts do not change robot positions, selected cards, phases, or programming availability. Completing all checkpoints does not end the existing game loop. Existing playback, membership, pause behavior, and private hands remain unchanged.

### Dealing the next hand

After all five registers have been resolved, the service deals each player a private hand for the next programming round.

Each player receives:

`cards.dealt {cards}`

through their private Socket.IO room.

A new hand may arrive while the client is still playing animations from the previous activation. The client should store the new hand immediately but must not enable programming until all queued resolved actions have finished playing.

### Game sequence

The following sequence shows one complete round while the game remains connected and unpaused.

Both players have already joined and received their initial hands in their JOINED acknowledgements.
```mermaid
sequenceDiagram
    participant A as Client A
    participant B as Client B
    participant Server as Game Service
    participant PrivateA as game:{gameId}:player:{A}
    participant PrivateB as game:{gameId}:player:{B}
    participant Public as game:{gameId}:public

    loop Each round
        A->>Server: program.submit {gameId, playerId, cardIds}
        Server-->>A: Acknowledgement: ACCEPTED
        Server->>Public: program.submitted {playerId: A}
        Public-->>B: program.submitted

        B->>Server: program.submit {gameId, playerId, cardIds}
        Server-->>B: Acknowledgement: ACCEPTED
        Server->>Public: program.submitted {playerId: B}
        Public-->>A: program.submitted
        loop Registers 1 through 5
            loop Eligible robots in antenna order
                Note over Server: Execute next instruction
                Server->>Public: robot.actionResolved
                Public-->>A: robot.actionResolved
                Public-->>B: robot.actionResolved
            end
        end

        Server->>PrivateA: cards.dealt {cards}
        PrivateA-->>A: cards.dealt {cards}
        Server->>PrivateB: cards.dealt {cards}
        PrivateB-->>B: cards.dealt {cards}
    end
```


## Reconnection
A player’s game membership is independent of their connection to the server. When the connection is lost, the client must indicate that it is disconnected and prevent gameplay submissions until the connection and game state have been restored.

There are two possible reconnection paths:

1. Socket.IO connection state recovery succeeds and missed events are replayed.
2. Connection state recovery fails, so the client logs in and joins the game again to obtain a fresh authoritative snapshot.

### Pausing on disconnection

When the server detects that a player has disconnected, it pauses the game. An action already in progress completes, but no subsequent action is executed. The current game state is preserved.

Connected clients are informed that the game is paused and which players are disconnected.

All clients must disable gameplay while the game is paused.

The server must reject gameplay submissions received while the game is paused.

### Restoring the connections

After an unexpected connection loss, the client attempts to reconnect automatically through Socket.IO. If Socket.IO can reestablish the connection, it will try to replay missed events through its [connection state recovery mechanism](https://socket.io/docs/v4/connection-state-recovery). 

#### Successful connection state recovery 
If recovery succeeds and the client still retains its local game state, Socket.IO replays missed events.

The client applies the recovered events in order and continues using its existing player and robot assignments.

```mermaid
sequenceDiagram
    participant A as Player A
    participant S as Game Service
    participant Public as game:{gameId}:public
    participant PrivateA as game:{gameId}:player:{A}
    participant B as Player B

    Note over A: Connection lost
    Note over A: Show disconnected status and disable gameplay
    Note over S: Detect disconnect and pause after current action

    S->>Public: game.playerConnectionChanged {gameId, playerId: A, connected: false, paused: true}
    Public-->>B: game.playerConnectionChanged
    Note over B: Show waiting for Player A and disable gameplay

    A->>S: Socket.IO reconnection
    Note over A,Public: Restore public room membership
    Note over A,PrivateA: Restore private room membership
    S-->>A: Replay missed public and private events

    S->>Public: game.playerConnectionChanged {gameId, playerId: A, connected: true, paused: false}
    Public-->>A: game.playerConnectionChanged
    Public-->>B: game.playerConnectionChanged

    Note over S: Continue gameplay from preserved state
    Note over A,B: Unpause clients
```

#### Failed connection state recovery

Once Socket.IO has reconnected, if state recovery was unsuccessful, the client performs the normal initialization flow by sending

`user.login`

followed by:

`game.join`

Because the user is already a game member, game.join restores the connection to the existing player and robot.

The returned JOINED acknowledgement contains the current authoritative state.

The client replaces its local game state with the returned JOINED data before processing further game events.

```mermaid
sequenceDiagram
    participant A as Player A
    participant S as Game Service
    participant Public as game:{gameId}:public
    participant PrivateA as game:{gameId}:player:{A}
    participant B as Player B

    Note over A: Connection lost
    Note over A: Show disconnected status and disable gameplay
    Note over S: Detect disconnect and pause after current action

    S->>Public: game.playerConnectionChanged {gameId, playerId: A, connected: false, paused: true}
    Public-->>B: game.playerConnectionChanged
    Note over B: Show waiting for Player A and disable gameplay

    A->>S: Establish Socket.IO connection
    Note over A: socket.recovered is false
    Note over S: Game remains paused until membership is reattached

    A->>S: user.login {username}
    S-->>A: Acknowledgement: LOGGED_IN {user}
    A->>S: game.join {gameId}
    Note over A,Public: Restore public room membership
    Note over A,PrivateA: Restore private room membership

    S-->>A: Acknowledgement: JOINED {assignment, state, hand, programSubmitted}
    Note over A: Clear outdated state and apply JOINED data

    S->>Public: game.playerConnectionChanged {gameId, playerId: A, connected: true, paused: false}
    Public-->>A: game.playerConnectionChanged
    Public-->>B: game.playerConnectionChanged

    Note over S: Continue gameplay from preserved state
    Note over A,B: Unpause game
```

### Resuming the game
The game remains paused while any remaining player is disconnected. Once all remaining players are connected, the server announces that the game has resumed before continuing gameplay from the preserved game state.

