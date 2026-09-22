# Communication in v0.5

**Draft for review.** Login/join behavior below is specified for the entry screen.
Multiplayer phase and membership behavior is specified too; runtime implementation follows separately.
See [the contract](asyncapi.yaml) or [rendered reference](asyncapi.html) for details;
[the v0 guide](v0Communication.md) describes the current implementation.

[Login and joining](#login-and-joining) · [Round flow](#round-flow) ·
[Round rules](v05Rounds.md) · [API reference](asyncapi.html)

## The flow

1. Enter a username of **1–30 characters**, without trimming or character restrictions.
   The service finds or creates the user and returns their identity.
2. Send a separate join request for the configured game. Receive a player/robot
   assignment, public state, and private hand together. Future lobby selection fits here,
   between login and joining.
3. Submit five ordered cards. The service checks ownership and waits for all players.
4. Execute five registers, with every robot acting in antenna order within each register.
   Send results immediately; clients play them in order before enabling the next hand.

There is no lobby phase, host, player cap, or timer. Players can join and leave at any
point. Joining during programming counts toward that round. Joining during activation
places the robot but it sits out that activation, receives `hand: []`, and gets its
first `cards.dealt` when programming starts.

## Messages

### Requests

Replies use acknowledgement callbacks, not separate emitted events.

| Request | Sends → receives |
| --- | --- |
| `user.login` | Username → user identity, never a player/robot |
| `game.join` | Game ID → assignment, public state, private hand |
| `game.leave` | Game ID → leave result |
| `game.getPublicGameState` | Game ID → snapshot for members only; reading does not join |
| `program.submit` | Game ID, round number, player ID, five card IDs → accepted/rejected |

### Server updates

All carry game and round IDs. Hands and submitted cards stay private.

| Event | Recipients | Purpose |
| --- | --- | --- |
| `game.playerJoined` | Existing members | Add the new player and robot |
| `game.playerLeft` | Remaining members | Remove the player and robot |
| `program.submitted` | All members | Update submission status |
| `game.phaseChanged` | All members | Start activation or programming |
| `robot.actionResolved` | All members | Play the next resolved action |
| `cards.dealt` | That player only | Receive the next hand |

## Login and joining

We can log in from several tabs with the same username, but only one can join a given
game. The others get `USER_ALREADY_IN_GAME` and can retry after that player leaves.
For now we check this in `game.join`; later it belongs at lobby entry.

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Game Service
    participant Others as Existing players
    C->>S: user.login {username}
    alt Valid username
        S-->>C: LOGGED_IN {user}
        C->>S: game.join {gameId}
        alt Join accepted
            S-->>C: JOINED {assignment, state, hand, programSubmitted}
            S-->>Others: game.playerJoined
            Note over C,S: Apply initialization before later game updates
        else Join rejected
            S-->>C: Rejection outcome
            Note over C: Keep login and allow a manual retry
        end
    else Invalid username
        S-->>C: INVALID_USERNAME
        Note over C: Keep input and show the error
    end
```

A few things to keep in mind when wiring up the client:

- Keep the same socket from login through gameplay, and use `VITE_GAME_ID` for joining.
  Show an error if it isn't configured correctly.
- Count username characters with `Array.from(username).length` so emoji count correctly.
- Disable the form while waiting. After login, keep the username fixed; a failed join
  should let us retry without logging in again. `LOGIN_REQUIRED` takes us back to login.
- Listen before joining, apply the returned assignment/state/hand/submission status
  together, then process later events in order. No extra initial snapshot or hand request.
  The server must leave no gap between that snapshot and live updates.
- After five seconds without a reply, show an error and let the user retry manually.
  The same request on the same socket returns the existing identity/assignment, not a
  duplicate. A join retry returns fresh state; ignore old replies and earlier events.
- Keep programming disabled during activation, after submission, without cards, or
  while playback is running. A disconnected client needs a new connection and login.

Only the connection that joined a game can read its snapshot. Login alone—even with
the same username in another tab—isn't enough. Nonmembers receive `GAME_NOT_FOUND`
without state; leaving or disconnecting removes access. The initial snapshot still
comes with a successful join.

Exact payloads and rejection codes are in [the contract](asyncapi.yaml).

## Round flow

Both clients have logged in and joined separately before this sequence starts.

```mermaid
sequenceDiagram
    participant A as Client A
    participant S as Game Service
    participant B as Client B
    A->>S: program.submit
    S-->>A: Ack: ACCEPTED
    Note over A,B: Shared submission status, wait for B
    B->>S: program.submit
    S-->>B: Ack: ACCEPTED
    Note over A,B: game.phaseChanged: EXECUTING
    loop Five registers, robots in recalculated antenna order
        S-->>A: robot.actionResolved
        S-->>B: robot.actionResolved
    end
    Note over A,B: game.phaseChanged: PROGRAMMING
    S-->>A: cards.dealt (A's hand)
    S-->>B: cards.dealt (B's hand)
    Note over A,B: Finish playback before enabling input
```

## Round and membership rules

Disconnect counts as leaving: remove the robot and submission requirement, then let
remaining players continue. Explicit leave keeps the user logged in. The antenna is
at the top centre of the test board, facing south.

See [multiplayer rounds](v05Rounds.md) for event order, mid-round changes, readiness,
and the handoff with [#70](https://github.com/hananinas/RoboRally/issues/70).
User storage lifetime is deferred to [#65](https://github.com/hananinas/RoboRally/issues/65);
it does not block this contract. [#70](https://github.com/hananinas/RoboRally/issues/70)
will use these agreed behaviors when defining the internal model.
