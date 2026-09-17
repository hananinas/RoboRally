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

## Development Setup

The recommended development environment uses Nix together with direnv. You do not need to run NixOS. The Nix package manager can also be installed on other Linux distributions and macOS.

The development shell provides the tools required by the project, including Node.js, pnpm, Process Compose, and project-specific development tooling.

### Nix
#### Requirements

The following tools must be installed system-wide:

- [Nix](https://nixos.org/download/)
- [direnv](https://direnv.net/) version 2.28.0 or newer

#### Setup
1. Copy the example direnv configuration:

   ```sh
   cp .envrc-example .envrc
   ```

2. Allow direnv for the repository:

   ```sh
   direnv allow
   ```

   The development shell defined in `flake.nix` will now be activated automatically whenever you enter the repository.

3. Start the local development processes:

   ```sh
   process-compose
   ```

The default development shell contains the tooling required for client, game-service, and AsyncAPI documentation development.

Individual development shells are also available:

- `nix develop .#client` — client development
- `nix develop .#game-service` — game-service development
- `nix develop .#asyncapi` — AsyncAPI documentation tooling
- `nix develop .#with-editor` — full development environment including the optional project Nixvim configuration

### Without Nix

Using Nix is the recommended and supported development setup. It ensures that all developers use compatible versions of the project tooling.

If you prefer not to use Nix, you must install the required tools yourself.

At minimum, you will need:

- Node.js 24 or a compatible version
- pnpm 10.9 or newer
- [Process Compose](https://f1bonacc1.github.io/process-compose/)
- AsyncAPI tooling for writing and generating API documentation

Then install the project dependencies:

```sh
pnpm install
```

and start the development processes with:

```sh
process-compose
```

The non-Nix setup is best-effort and may require additional platform-specific tooling.

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

