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

### Pausing on disconnection

When the server detects that a player has disconnected, it pauses the game. An action already in progress completes, but no subsequent action is executed. The current game state is preserved.

All clients must disable the game while the game is paused, and the server must reject any submissions it receives during that time. Connected clients are informed that the game is paused and which players are disconnected.


### Restoring the connections
After an unexpected connection loss, the client attempts to reconnect automatically through Socket.IO. If Socket.IO can reestablish the connection, it will try to replay missed events through its connection [state recovery mechanism](https://socket.io/docs/v4/connection-state-recovery). 


If recovery succeeds and the client retains its local game state, it applies the recovered events and continues using its existing player and robot assignments.

If recovery fails or the client has restarted, the client must establish a connection and use user.login followed by game.join. 
When the user already belongs to the game, game.join attaches the connection to the existing player and robot. It preserves their game state and returns their current assignment and state. It does not create another player or robot or emit game.playerJoined.


### Resuming the game
The game remains paused while any remaining player is disconnected. Once all remaining players are connected, the server announces that the game has resumed before continuing gameplay from the preserved game state.


### Sequence diagrams

#### Successful connection state recovery
```mermaid
sequenceDiagram
    participant A as Player A
    participant S as Game Service
    participant B as Player B

    Note over A,S: Connection lost
    Note over A: Show Connection lost message and pause/disable game
    Note over S: Detect disconnect and pause after current action
    S-->>B: Announce pause and disconnected player
    Note over B:  Show Connection lost message and pause/disable game

    A->>S: Attempt Socket.IO reconnection
    S-->>A: Restore session and replay missed events
    Note over A: Apply recovered events

    alt All remaining players are connected
        S-->>A: Announce game resumed
        S-->>B: Announce game resumed
        Note over S: Continue preserved game
    else Another player is disconnected
        Note over S: Game remains paused
    end
```

#### Failed connection state recovery 
```mermaid
sequenceDiagram
    participant A as Player A
    participant S as Game Service
    participant B as Player B

    Note over A,S: Connection lost
    Note over A:  Show Connection lost message and pause/disable game
    Note over S: Detect disconnect and pause after current action
    S-->>B: Announce pause and disconnected player
    Note over B:  Show Connection lost message and pause/disable game

    A->>S: Establish connection
    S-->>A: Connection restored without recovery
    Note over A: socket.recovered is false

    A->>S: user.login
    S-->>A: LOGGED_IN
    A->>S: game.join
    S-->>A: JOINED with existing assignment and current state
    Note over A: Replace local state with JOINED data

    alt All remaining players are connected
        S-->>A: Announce game resumed
        S-->>B: Announce game resumed
        Note over S: Continue preserved game
    else Another player is disconnected
        Note over S: Game remains paused
    end

```


