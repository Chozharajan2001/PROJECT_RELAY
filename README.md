# PROJECT_RELAY

Operator-supervised task routing: an Express API assigns tasks to contributors via a
separate engine worker; a Next.js board gives the operator full override control.
Constraints: ≤1 active assignee, 5–20s engine latency, 20% silent drops, restart-safe.

## Prerequisites

- Node ≥ 20, npm ≥ 10.

## Run

```bash
npm install
npm run dev        # api :3001 · engine worker · web :3000
```

| Service | URL / purpose |
|---|---|
| web | http://localhost:3000 — operator board (see [Operator guide](docs/OPERATOR-GUIDE.md)) |
| api | http://localhost:3001 — REST + `GET /health` (see [API reference](docs/API.md)) |
| engine | worker — simulated router, callback-only (see [Engine simulation](docs/ENGINE.md)) |

## Verify

```bash
npm run typecheck  # all workspaces
npm run test       # all workspaces (vitest)
npm run test:e2e --workspace apps/api  # scripted E2E: 4 use cases + kill-restart (~40s)
```

## Seed data

```bash
npm run seed --workspace apps/api  # idempotent; uses DB_PATH (default ./data/relay.db)
```

- 10 contributors across `finance, healthcare, data-analysis, operations` (none with `legal`,
  so the engine's explicit no-match path stays reachable — try the No-match preset on `Legal q`-style tasks).
- 20 tasks across areas and priorities, all `created`.
- Deterministic demo via per-request overrides: `{"engine": {"delayMs"}}`,
  `{"drop": true}`, `{"forceNoMatch": true}` (ADR-003), or the board's Scenario buttons.

## Docs

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, lifecycle, data model, config
- [API.md](docs/API.md) — endpoint reference with examples
- [ENGINE.md](docs/ENGINE.md) — simulator behavior, overrides, restart semantics
- [OPERATOR-GUIDE.md](docs/OPERATOR-GUIDE.md) — the four use cases, step by step
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, scripts, tests, troubleshooting
- [DECISIONS.md](docs/DECISIONS.md) — ADRs 001–004
- [CHANGELOG.md](docs/CHANGELOG.md) — release history

## Layout

```
apps/web          Next.js operator board
apps/api          Express API + SQLite (sole state owner)
apps/engine       Routing simulator worker (stateless, callback-only)
packages/contracts  Shared zod schemas + types
```

Pushes and merges require explicit human approval.
