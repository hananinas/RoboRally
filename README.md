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

## Requirements

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
