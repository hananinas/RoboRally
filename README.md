<div align="center">
  <h1>Robo Rally</h1>
  <a href="">
    <img src="https://github.com/user-attachments/assets/e21f2d45-6775-48d8-bf8b-9b1cb99d22e5" alt="Logo" height="80">
  </a>
  <h3>For DTU Software Engineering 2</h3>
</div>

Building a web-based multiplayer version of the board game `Robo Rally`.

## Multiplayer demo

On `demo/multiplayer`, run `pnpm install` followed by `pnpm demo`.
Open the client URL printed by Vite in two browser windows, enter different
usernames, and join before either player submits. Select five cards and press
Done in each window. The first player waits for the other; both clients play
all robot actions before enabling the next hand. Repeat for another round.
Closing a window removes that player and lets the remaining players continue.

This local integration combines #83, #82, #64, and the #76 contract now on main.
It adds the membership and client initialization needed to connect those pieces.
The demo retains #83's explicit phase events and round numbers; these extend the
merged #76 contract and must be reconciled before promoting the integration to main.
User identities and games are in memory. Reload to log in again after disconnect.
The fixed demo hand contains Move 1 and Turn Left; this is a multiplayer gameplay
loop, without victory conditions or the full board-game rules.

`pnpm test:multiplayer` starts the real service and two independent browser clients,
checks every action across two rounds, and verifies disconnect cleanup.
`pnpm test` includes this scenario alongside the unit and fixture browser tests.

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

