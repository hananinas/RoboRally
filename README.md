# RoboRally

RoboRally is a pnpm monorepo for the project applications and shared packages.
The repository currently contains a browser-based Battleship game built with
React, TypeScript, Vite, and Vitest.

## Repository structure

The workspace separates deployable applications from reusable packages:

```text
.
├── apps/
│   └── client/       # React and Vite web application
├── packages/         # Shared packages added as the project grows
├── package.json      # Workspace scripts and configuration
└── pnpm-workspace.yaml
                       # Workspace package locations
```

The `.npmrc` configuration uses pnpm's isolated linker and a separate lockfile
for each workspace. Application dependencies are installed under that
application's `node_modules` directory. For example, the client dependencies
are under `apps/client/node_modules`.

## Requirements

Install the following tools before you start:

- Node.js 20.19 or newer
- pnpm 10.9 or newer

## Get started

Run all commands from the repository root:

```bash
pnpm install
pnpm dev
```

Open the URL printed by Vite, normally
[http://localhost:5173](http://localhost:5173).

## Available commands

Use the root scripts to work with the monorepo:

- `pnpm dev` starts the client development server.
- `pnpm build` builds every workspace that defines a build script.
- `pnpm test` runs tests in every workspace that defines a test script.
- `pnpm typecheck` checks types in every workspace that defines a typecheck
  script.

To run a command for one workspace, use pnpm's filter option:

```bash
pnpm --filter @robo-rally/client test
```

## Add a workspace

Create applications under `apps/` and reusable libraries under `packages/`.
Each workspace needs a unique `name` in its `package.json`. Run `pnpm install`
from the repository root after adding it so pnpm installs its dependencies.

## Client configuration

Edit `apps/client/game/config.ts` to change the battlefield size or ship
configuration:

```typescript
export const GRID_SIZE = 8;
export const SHIPS = [7, 4, 3, 2];
```

## License

The client is based on the MIT-licensed Battleship project by
[Karel Klima](https://karelklima.com). See
[`apps/client/LICENSE`](apps/client/LICENSE) for license details.
