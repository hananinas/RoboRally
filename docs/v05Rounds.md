# Multiplayer rounds in v0.5

See [AsyncAPI](asyncapi.yaml) for payloads and event order, and
[the overview](v05Communication.md) for login/join behavior.

## Mid-round changes

- A join handled before activation starts counts this round; one handled after it
  waits until the next. The waiting robot is already on the board and can block movement.
- Leaving during programming can trigger activation if everyone remaining has submitted.
- Leaving during activation cancels that robot's future actions, not completed ones.
  If no eligible robots remain, end activation and start the next programming round,
  including any waiting newcomers. An empty game stays idle.
- Handle joins/leaves between robot actions. Keep one progression path shared by
  submission and membership changes; don't add separate execution loops or animation waits.

## Playback

Queue removals and phase changes behind earlier actions. A new hand can arrive while
animation is running: keep it for later without clearing the displayed program or
skipping valid queued actions.

## Antenna

Use `(10, 0)`, facing south (`Math.PI / 2`), on the test board for now; top centre on other
board sizes. Follow the [existing priority algorithm](game_model_UML.md#robot-priority-typescript-reference-implementation),
using join order to break exact ties. The antenna doesn't reserve a robot tile.

## Coordination

Agree the membership/progression interfaces with [#70](https://github.com/hananinas/RoboRally/issues/70).
[#69](https://github.com/hananinas/RoboRally/issues/69) handles joining/leaving and
[#68](https://github.com/hananinas/RoboRally/issues/68) handles submissions; both need
to expose resulting phase changes to [#67](https://github.com/hananinas/RoboRally/issues/67).
