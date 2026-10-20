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

The acknowledgement contains the player's current robot assignment, public game state, only that player's private hand, and program-submission status. `state.players` includes every lobby member's public registers, checkpoint progress, damage, submission status, and connection status, identified by `playerId`; disconnected members remain present. `state.roundNumber` identifies the current deal. The client must replace old state with all JOINED data before processing later live game events. A future lobby may be inserted between login and joining without changing this model.

### Public registers and stats

Each `PlayerState` has five `registers` in register order, `lastCheckpoint`, and a nonnegative integer `damage` count. Public slots have exactly one of these shapes:

- `{status: EMPTY}`: no card is placed.
- `{status: HIDDEN}`: a placed card, rendered as a card back. No card ID, instruction, type, hash, or other identity is allowed.
- `{status: REVEALED, instruction}`: the instruction becomes public only when that player's register executes. Card instance IDs are never public.

This projection is the same for all recipients, including the owner. The owner's private hand and local selections are separate from public register state. Other players' registers are read-only and cannot supply cards for a program.

Snapshots and live register/stat events are restricted to members of `game:{gameId}:public`. Private hands go only to their owning connection in JOINED or `game:{gameId}:player:{playerId}`. No payload delivered to another player may contain that hand. `game.getLobbyDetails` continues to expose lobby metadata and player names, not registers, stats, or hands. Recovery must recheck room ownership; visibility never grants ownership.

`game.playerJoined` supplies a new member's initial empty registers and zero stats. `game.playerLeft` removes their registers and stats with their membership and robot; discard queued updates for that membership. `game.playerConnectionChanged` only changes connection/pause status and retains registers and stats.

Snapshot creation and live-event delivery must be ordered so no update is lost between JOINED and later events. After JOINED, do not replay events predating that snapshot; successful recovery instead replays missed events against retained state in order.

### Listing lobbies

After login, the client can ask which lobbies exist:

`game.getLobbyDetails`

A successful request returns:

`LOBBY_FOUND {lobbies}`

Each lobby includes its `gameId`, which the client uses to send `game.join`. A connection that has not logged in receives `LOGIN_REQUIRED`, and a malformed request receives `INVALID_REQUEST`.

### Membership

New players may join a game until the server accepts the first program submission. Accepting that submission starts the game and permanently closes joining to new players. Later attempts by new players receive GAME_ALREADY_STARTED. 

In case of disconnection, existing members may reconnect at any time. If the tab is left open SocketIO will automatically try to reestablish the connection. In case of a closed tab, the player can reopen the webpage in another tab to reconnect. In case multiple tabs are used, the first connection to reclaim a disconnected membership becomes its owner. A later connection cannot replace that owner, even if its Socket.IO session was successfully recovered. 

When an existing member sends game.join while not being connected, the server attaches the new connection to the existing player and robot and returns their current assignment and state through JOINED.

If another connection attempts to join the same game for that user, it receives:

`USER_ALREADY_IN_GAME`

A failed join leaves the user logged in and the client may attempt another join later.

An explicit `game.leave {gameId}` removes the owning connection's player and robot, frees the occupied tile, and revokes its public/private room access. `LEFT` retains login. Remaining members receive `game.playerLeft {gameId, playerId, robotId}`. A disconnected player remains a member; disconnecting is not leaving. Leaving does not reopen a game that has already started.

Reconnection behavior is described in the Reconnection section.

The following diagram documents logging in, listing lobbies and joining:

```mermaid
sequenceDiagram
    participant Client
    participant Server as Game Service
    participant Public as game:{gameId}:public
    participant Others as Existing members

    Client->>Server: user.login {username}
    alt Valid username
        Server-->>Client: Acknowledgement: LOGGED_IN {user}
        Client->>Server : game.getLobbyDetails
        Server-->>Client: Acknowledgement: LOBBY_FOUND {lobbies}
        Note over Client: Picks a lobby's gameId
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

After each local placement or removal, the client sends `program.updateRegisters {gameId, playerId, roundNumber, occupied}`, where `occupied` is exactly five booleans in register order. This is an occupancy-only preview, not a playable program; it contains no card identity. The server checks connection-owned membership, matching game/player IDs, the current round, programming phase, pause state, and that no program was already accepted. Invalid requests leave state unchanged.

An accepted update receives `program.updateRegistersResult {outcome: ACCEPTED}` through its acknowledgement and broadcasts `game.playerStateChanged {gameId, roundNumber, player}` to all connected lobby members, including the sender. The complete public `player` has HIDDEN for occupied draft slots and EMPTY otherwise. Clients replace only an existing player's state in the current round. This event also carries every damage change, including changes outside robot actions, without exposing any hand or unexecuted card.

Damage caused by an action is broadcast after its `robot.actionResolved` and before subsequent actions or the next round start. All public state events share server order, so a complete player update cannot reveal a register before its execution event.

The client sends:

`program.submit {gameId, playerId, roundNumber, cardIds}`

The service verifies that the connection owns the game/player membership, all five distinct card IDs belong to that player's current hand, and the round, phase, and pause state permit submission. Occupancy previews and public instructions never authorize submitting another player's cards.

A successful submission receives:

`ACCEPTED`

The server then emits:

`program.submitted {gameId, playerId, roundNumber, phase}`

to every connected member of the game's public room, including the submitter.

This sets the player's `programSubmitted` to true and all five public registers to HIDDEN, even if no draft preview was sent. No card identity is revealed. `phase` is the authoritative phase after acceptance; accepting the final required program changes it to EXECUTING. If departure makes the remaining programs ready, the first `robot.actionResolved` establishes EXECUTING. The server waits until all remaining players have successfully submitted before beginning activation.


### Submission failures

A submission can be rejected for a mismatched or malformed request, because the connection is not a member of the game, because `roundNumber` is stale (`STALE_ROUND`), because the round has already moved past programming, because the player already has a stored program for this round, because the game is paused, or because of an unexpected service failure. See [AsyncAPI](asyncapi.yaml) for the exact rejection codes.

A rejected submission does not replace or modify the player's current program.

If the client receives no acknowledgement, the outcome is unknown. The client must not automatically resend the submission because the original request may have been accepted.


### Activation

Once all players have submitted, the service resolves the five registers in order. Within each register, eligible robots act according to antenna priority. Priority is recalculated after each robot action before the next robot acts.

Each resolved action is emitted publicly as:

`robot.actionResolved {gameId, roundNumber, playerId, robotId, registerIndex, instruction, position}`

Clients process resolved actions in received order for existing players in the current round. `playerId` matches the robot's owner. Only that owner's `registerIndex` becomes REVEALED with the executed `instruction`; every other unexecuted placed card stays HIDDEN, even in the same register index on another robot. The actor and zero-based register index identify the action being played; display registers as 1–5. These reveals persist in reconnect snapshots until the next deal.

#### Activation ordering

The antenna is located at the top centre of the board and faces south.

The test board uses:

- position (10, 0)
- direction Math.PI / 2

The antenna does not occupy a robot tile.

Exact priority ties are resolved using player join order. The priority algorithm defines the complete robot action order.

If an unexpected service failure makes gameplay unrecoverable, members receive `game.aborted {gameId}` and the game ends permanently.

### Checkpoint progress

Tiles have an optional `checkpointNumber` alongside their walls and keep type `EMPTY`. Omit the number when there is no checkpoint. Numbers are positive integers, unique and consecutive from 1. Checkpoints stay at fixed positions and remain available to every player after completion. The demo board places checkpoint 1 at `(10, 6)` and checkpoint 2 at `(8, 9)`.

`PlayerState.lastCheckpoint` starts at 0 and persists across rounds and reconnections. `PublicGameState.checkpointCount` counts the checkpoint tiles. Both values are authoritative integers with `0 <= lastCheckpoint <= checkpointCount`. Clients cannot award or request changes to progress. JOINED supplies both values; `game.playerJoined` includes the new player's initial progress.

After all remaining robots have acted in a register, a player completes the next numbered checkpoint if their robot ends on its tile. Passing over a checkpoint does not count; facing does not matter. The same check runs if a departure completes the register.

When progress changes, the service broadcasts to `game:{gameId}:public`:

`player.checkpointProgress {gameId, roundNumber, playerId, lastCheckpoint, checkpointCount}`

The event follows the related `robot.actionResolved`, or `game.playerLeft` when a departure completes a register, and precedes subsequent actions or private hands. Only remaining players receive it. Unchanged progress produces no event.

The client displays `lastCheckpoint/checkpointCount` and `damage` for every player, initially `0/x` (or `0/0` without checkpoints) and zero damage. Apply stat events immediately, independently of queued movement animations. Ignore other games, unknown or removed players, older rounds, and duplicate or older progress. Successful Socket.IO recovery replays missed events; failed recovery replaces every player's registers and stats from JOINED.

Progress updates leave robot positions, selected cards, phases, programming availability, playback, membership, pause behavior and private hands unchanged. Completing all checkpoints does not end the game.

### Dealing the next hand

After all five registers and their stat changes have been resolved, the service broadcasts `game.programmingStarted {gameId, roundNumber}` to all connected lobby members before dealing any private hands. The round number starts at 1 and increments once per new deal. This event atomically sets phase to PROGRAMMING, clears every remaining player's five public registers to EMPTY, resets their `programSubmitted` flags, and clears the previous active register. Stats and connection state persist. Initial JOINED supplies the same baseline for round 1.

Each player receives:

`cards.dealt {gameId, playerId, roundNumber, cards}`

through only their own private Socket.IO room. Public round reset does not depend on anyone receiving a private hand.

Apply the hand only for the current game, own player, and current round. Duplicate or older round-start events have no effect. Discard stale draft updates and events from older rounds; a newer-round event requires its public round-start baseline first, otherwise rejoin for a fresh snapshot. A new hand may arrive while the client is still playing animations from the previous activation. Store the hand immediately, but do not enable programming until queued resolved actions finish. Old animation playback must not overwrite current-round registers or stats.

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
        A->>Server: program.updateRegisters {gameId, playerId: A, roundNumber, occupied}
        Server-->>A: Acknowledgement: ACCEPTED
        Server->>Public: game.playerStateChanged {gameId, roundNumber, player}
        Public-->>A: game.playerStateChanged
        Public-->>B: game.playerStateChanged
        A->>Server: program.submit {gameId, playerId, roundNumber, cardIds}
        Server-->>A: Acknowledgement: ACCEPTED
        Server->>Public: program.submitted {gameId, playerId: A, roundNumber, phase}
        Public-->>A: program.submitted
        Public-->>B: program.submitted

        B->>Server: program.submit {gameId, playerId, roundNumber, cardIds}
        Server-->>B: Acknowledgement: ACCEPTED
        Server->>Public: program.submitted {gameId, playerId: B, roundNumber, phase}
        Public-->>A: program.submitted
        Public-->>B: program.submitted
        loop Registers 1 through 5
            loop Eligible robots in antenna order
                Note over Server: Execute next instruction
                Server->>Public: robot.actionResolved
                Public-->>A: robot.actionResolved
                Public-->>B: robot.actionResolved
            end
        end

        Server->>Public: game.programmingStarted {gameId, roundNumber}
        Public-->>A: game.programmingStarted
        Public-->>B: game.programmingStarted
        Server->>PrivateA: cards.dealt {gameId, playerId: A, roundNumber, cards}
        PrivateA-->>A: cards.dealt
        Server->>PrivateB: cards.dealt {gameId, playerId: B, roundNumber, cards}
        PrivateB-->>B: cards.dealt
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

The client applies recovered events in order and continues using its existing player and robot assignments. Retained registers and stats are updated using the same round, reveal, and reset rules as live events; another player's private hand must never be replayed to this connection.

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

The returned JOINED acknowledgement contains the current authoritative state, including every remaining player's registers, checkpoint progress, damage, and connection status at `state.roundNumber`. Executed registers remain REVEALED; placed but unexecuted registers remain HIDDEN with no identity. Only the reconnecting player's private hand is returned.

The client replaces its entire local snapshot and clears obsolete queued updates before processing further game events. Do not merge registers from the previous deal.

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

