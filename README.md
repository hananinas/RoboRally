<div align="center">
  <h1>Robo Rally</h1>
  <a href="">
    <img src="https://github.com/user-attachments/assets/e21f2d45-6775-48d8-bf8b-9b1cb99d22e5" alt="Logo" height="80">
  </a>
  <h3>For DTU Software Engineering 2</h3>
</div>

Building a web-based multiplayer version of the board game `Robo Rally`.

## Current state

The client and Game Service implement the v0 single-player loop using shared
Socket.IO game events. Browser tests use an isolated contract fixture rather
than starting the production service.

The Game Service keeps users in memory, keyed by their exact username. User IDs
last only as long as that service instance: a restart creates a new ID for the
same username. A new connection must log in again, but receives the existing
ID while the service runs.

RoboRally is available at: https://se2-c.compute.dtu.dk

### Trusting the SSL certificate
We are using a self signed certificate. This means we have to trust the server public root certificate to be able to use https. This becomes especially relevant when we implement authentication features. The app will not work with plain http at that point.

#### NixOS

Place `infra/robo-rally-root.crt` beside the NixOS configuration module containing:

```nix
security.pki.certificateFiles = [
  ./robo-rally-root.crt
];

programs.firefox = {
  enable = true;
  policies.Certificates.Install = [
    "${./robo-rally-root.crt}"
  ];
};
```

#### Other Distros

```sh
sudo install -m 0644 infra/robo-rally-root.crt \
  /usr/local/share/ca-certificates/robo-rally-root.crt

sudo update-ca-certificates
```

Then in firefox add a setting trusting this certificate.


## Development Setup

The recommended development environment uses Nix together with direnv. You do not need to run NixOS. The Nix package manager can also be installed on other Linux distributions and macOS.

The development shell provides the tools required by the project, including Node.js, pnpm, Process Compose, and project-specific development tooling.

### Run the client and server

Run these commands from the repository root. Install the dependencies and
configure the client before starting the development processes:

```sh
pnpm install
cp apps/client/.env.example apps/client/.env
```

Set the game ID in `apps/client/.env`:

```env
VITE_GAME_ID=00000000-0000-4000-8000-000000000001
```

Start the client and Game Service together:

```sh
pnpm dev
```

You can also run them in separate terminals. Start the Game Service first:

```sh
pnpm --filter @robo-rally/game-service dev
```

The Game Service listens at `http://127.0.0.1:3001`. In another terminal,
start the client:

```sh
pnpm --filter @robo-rally/client dev
```

Vite opens the client in your browser, normally at `http://localhost:5173`.

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
