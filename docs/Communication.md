# Communication

The browser and Game Service use Socket.IO. Requests receive acknowledgement
callbacks; game updates arrive as events. This guide describes the v0.5 flow.
[AsyncAPI](asyncapi.yaml) defines the exact payloads and rejection codes, with a
[rendered reference](asyncapi.html).

## Login and joining

The client logs in with a username and receives a user ID. Login creates no
player, robot, or game membership.

The client then sends `game.join` on the same socket for the configured game.
`JOINED` returns the player/robot assignment, public state, private hand, and
submission status together. The client applies them before live game events. A
future lobby can fit between login and joining.

Multiple connections may log in as the same user, but only one may join a given
game. Another connection receives `USER_ALREADY_IN_GAME`. A failed join leaves the
user logged in and may be retried. Only the connection that joined may read that
game's snapshot through `game.getPublicGameState`; nonmembers receive
`GAME_NOT_FOUND` without state.

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

## Programming and activation

Each player submits five distinct card IDs in register order for the current round.
The service checks ownership and waits until all current players have submitted.
It then resolves five registers. Within each register, robots act in antenna
priority order, recalculated after each action. Afterward, the service deals each
player a private hand for the next round. Clients play resolved actions in event
order before enabling the newly dealt hand.

The sequence keeps public and private Socket.IO rooms visible. Both clients have
already joined and received their initial hand in the `JOINED` acknowledgement.

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

`INVALID_PROGRAM` rejects a malformed, stale, duplicate, unauthorized, or
wrong-phase submission without changing the program. `INTERNAL_ERROR` means the
service failed before accepting it. If no acknowledgement arrives, the outcome
is unknown; the client must not resend automatically.

## Membership and playback

Players may join or leave at any point. A join during programming counts toward
that round. A join during activation places the robot on the board, but it sits
out until the next programming phase and receives `hand: []` initially. Leaving
during programming rechecks whether all remaining players have submitted;
leaving during activation cancels only that robot's future actions. An empty game
stays idle. A waiting robot can still block movement; handle joins and leaves
between robot actions. If no eligible robots remain, end activation once and
begin the next programming round. Explicit `game.leave` keeps the user logged
in; disconnect removes membership and requires login on a new connection.

The antenna is at the top centre of the board, facing south. The test board uses
`(10, 0)` and `Math.PI / 2`; exact ties use join order. It does not occupy a robot
tile. [The priority algorithm](game_model_UML.md#robot-priority-typescript-reference-implementation)
defines the action order.

The client uses `VITE_GAME_ID` for the shared game and connects to the Game Service
at the application's origin. It listens before joining, applies the `JOINED`
result together, and then processes later events in order. It keeps programming
locked during activation, after submission, without a hand, or while playback is
running.
A hand may arrive before playback ends; keep it until all queued actions finish.
Queue membership changes behind earlier resolved actions.
Login and join requests may be retried manually after a five-second timeout on
the same socket; repeated requests reuse the existing identity or assignment.


## Reconnection
A player’s game membership is independent of their connection to the server. When the connection is lost, the client must indicate that it is disconnected and prevent gameplay submissions until the connection and game state have been restored.

After an unexpected connection loss, the client attempts to reconnect automatically through Socket.IO. If Socket.IO can reestablish the connection, it will try to replay missed events through it's connection [state recovery mechanism](https://socket.io/docs/v4/connection-state-recovery). IF this fails, or if automatic reconnection fails or the client has restarted it must go thorugh the synchronization mechanism described in the next section. 

The below sequence diagrams shows how successful reconnection using Socket.IO's features would look like. 
```mermaid
sequenceDiagram
    participant C as Client
    participant S as Game Service

    Note over C,S: Connected and synchronized
    Note over C,S: Connection lost
    Note over C: Show disconnected status
    Note over C: Disable gameplay submissions

    C->>S: Attempt Socket.IO reconnection
    S-->>C: Restore connection and replay missed events
    Note over C: Apply recovered events

```

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Game Service
    
    Note over C,S: Connected and synchronized
    Note over C,S: Connection lost
    
    Note over C: Show disconnected status
    Note over C: Disable gameplay submissions
    
    C->>S: Attempt Socket.IO reconnection
    S-->>C: Connection restored
   
    Note over C: socket.recovered is false
    Note over C,S: Continue with snapshot synchronization
```

## Synchronization

Players can disconnect at any time. This could be due to several reasons:

1. Client actively disconnects
2. Client crashes
3. Unreliable client internet/VPN connection

This can lead either to a complete loss of client game state or the client becoming unsynchronized through missed updated, leading to the client holding a different game state than the server. 

The application must detect these situations and restore synchronization. In all cases, recovery consists of requesting a complete snapshot of the public game state and the player’s own private state, then replacing the corresponding local state.


### Complete loss of game state
If the client no longer has a usable local game state, for example after a crash or page reload, it must reconnect, restore its player session, and request a complete snapshot.

sequenceDiagram
    participant C as Client
    participant S as Game Service

    Note over C: Client restarts after crash or page reload
    Note over C: Keep gameplay submissions disabled

    C->>S: Establish connection
    S-->>C: Connection established

    Note over C,S: Continue with snapshot synchronization

### Partial loss or inconsistency of game state
A client may retain its local game state but miss or incorrectly apply updates. One way to detect this would be to include the complete resulting state with every server update. The client could apply the update and compare its resulting state with the server’s state. However, this would increase message size.
Instead, server updates can include a hash of the resulting state. After applying an update, the client calculates a hash of the corresponding local state and compares the two. If they differ, the client requests a complete snapshot and replaces its local state.
Each hash must describe the state immediately after its corresponding update, so that the client compares states from the same point in the game.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Game Service

    S-->>C: Game update and resulting state hash
    Note over C: Apply update and calculate local hash

    alt Hashes match
        Note over C: Continue normal interaction
    else Hashes differ
        Note over C: Show unsynchronised status
        Note over C: Disable gameplay submissions
        Note over C,S: Continue with snapshot synchronization
    end
```

### Applying a snapshot
While synchronization is in progress, the client must prevent gameplay submissions and coordinate incoming updates with snapshot replacement. Updates already included in the snapshot must not be applied again, and later updates must not be lost. Any queued animations based on the replaced state must be cleared or reconciled.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Game Service

    Note over C: Disabled gameplay submissions
    Note over C: Buffer incoming game updates
    C->>S: Request complete snapshot
    Note over S: Capture consistent public and private state
    S-->>C: Snapshot with version number

    Note over C: Replace public and private state together
    Note over C: Discard buffered updates covered by snapshot
    Note over C: Apply newer buffered updates

    alt State hashes match
        Note over C: Resume live update processing
        Note over C: Enable interaction as game rules allow
    else State hash mismatch
        Note over C: Keep gameplay submissions disabled
        C->>S: Request a fresh snapshot
    end
```
