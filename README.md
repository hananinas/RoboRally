<div align="center">
  <h1>Robo Rally</h1>
  <a href="">
    <img src="https://github.com/user-attachments/assets/e21f2d45-6775-48d8-bf8b-9b1cb99d22e5" alt="Logo" height="80">
  </a>
  <h3>For DTU Software Engineering 2</h3>
</div>

Building a web-based multiplayer version of the board game `Robo Rally`.

## Current state

The repository is an empty implementation starting point. It contains a React, TypeScript, and Vite client shell with minimal TypeScript User and Game Service workspaces. Game and user functionality have not been implemented.

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

Install Chromium once before running the browser tests:

```bash
pnpm --filter @robo-rally/client exec playwright install chromium
```
