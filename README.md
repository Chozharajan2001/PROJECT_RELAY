# PROJECT_RELAY

Operator-supervised task routing: an Express API assigns tasks to contributors via a
separate engine worker; a Next.js board gives the operator full override control.
(Assignment constraints: ≤1 active assignee, 5–20s engine latency, 20% silent drops,
restart-safe. See HIVE/docs/DESIGN.md.)

## Prerequisites

- Node ≥ 20, npm ≥ 10.

## Run

```bash
npm install
npm run dev        # api :3001 · engine worker · web :3000
```

| Service | URL / purpose |
|---|---|
| web | http://localhost:3000 — operator board (EPIC-4) |
| api | http://localhost:3001 — REST + `GET /health` |
| engine | worker — simulated router, callback-only (EPIC-3) |

## Verify

```bash
npm run typecheck  # all workspaces
npm run test       # all workspaces (vitest)
```

## Seed plan (EPIC-5, T-5.1.1)

- `apps/api/src/seed.ts` (planned): 20 tasks + 10 contributors across
  `finance, healthcare, data-analysis, operations`, plus zero contributors with
  `legal` expertise so the engine's explicit no-match path is reachable.
- Idempotent: re-running the seed never duplicates rows.
- Deterministic demo via per-request overrides: `{"engine": {"delayMs"}}`,
  `{"drop": true}`, `{"forceNoMatch": true}` (ADR-003).

## Layout

```
apps/web          Next.js operator board
apps/api          Express API + SQLite (sole state owner)
apps/engine       Routing simulator worker (stateless, callback-only)
packages/contracts  Shared zod schemas + types
```

Pushes and merges require explicit human approval.
