<div align="center">
  <h1>Robo Rally</h1>
  <a href="">
    <img src="https://github.com/user-attachments/assets/e21f2d45-6775-48d8-bf8b-9b1cb99d22e5" alt="Logo" height="80">
  </a>
  <h3>For DTU Software Engineering 2</h3>
</div>

Building a web-based multiplayer version of the board game `Robo Rally`.

## Current state

The client renders a board and robot from shared Socket.IO game events, submits
five-card programs, and plays resolved actions in order. The Game Service has a
tested in-memory game model. Its runnable Socket.IO server is tracked in
[#40](https://github.com/hananinas/RoboRally/issues/40); until that lands, browser
tests use an isolated contract fixture rather than a production service.

## Development

### NixOS
Note: Currently the flake only installs documentation dependencies. 

#### Requirements

You must have the following tools available system-wide prior to installation:

    - [direnv](https://direnv.net) version >= 2.28.0

#### Setup
1. Enable direnv.

   - Copy `.envrc-example` as `.envrc`.
   - Enable direnv:
     `$ direnv allow`
     The development shell defined in flake.nix is automatically activated upon entering the directory.


### Other OS/Distributions

#### Requirements

You must have the following tools available system-wide prior to installation:

    - Node.js 20.19 or newer
    - pnpm 10.9 or newer

## Structure

```text
.
├── apps/
│   ├── client/
│   ├── game-service/
│   └── user-service/
├── package.json
└── pnpm-workspace.yaml
```

Run commands from the repository root:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
```

### Connect the client to a Game Service

Copy `apps/client/.env.example` to `apps/client/.env.local`. Set `VITE_GAME_ID`
to the service's game UUID and `VITE_GAME_SERVICE_URL` to its HTTP origin.
Leave the URL empty only when Socket.IO is served through the client's origin.
Restart `pnpm dev` after changing these values. A separate service origin must
allow the client's origin through Socket.IO CORS.

The client requests state on connection and after each dealt hand. It preserves
all five resolved actions even if the next hand arrives before playback ends.
A rejected program keeps its selection for editing and retry. A missing
acknowledgement or disconnected socket never triggers an automatic resend.
Reconnection and replay are outside the current contract.

Run focused client and server unit tests with:

```bash
pnpm --filter @robo-rally/client test:unit
pnpm --filter @robo-rally/game-service test
```

Both commands use Vitest. Client browser tests start their own Socket.IO fixture
and Vite server on ports 4174 and 4173; no running Game Service is required.

Install Chromium once before running the browser tests:

```bash
pnpm --filter @robo-rally/client exec playwright install chromium
```
