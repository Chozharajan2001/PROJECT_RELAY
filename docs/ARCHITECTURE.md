# ARCHITECTURE — PROJECT_RELAY

Three processes, one database, one rule: **the API owns every state transition**.

```
Operator → Web (Next.js :3000) → API (Express :3001) → SQLite (WAL)
                                       ↑      ↓ poll GET /internal/routing-jobs
                                       │      Engine worker (stateless, callback-only)
                                       └──── POST /internal/routing-callback
```

## Components

| Process | Code | Role |
|---|---|---|
| `apps/web` | Next.js App Router, server components | Operator board, task detail + history, scenario presets, modals. No direct DB access; talks to the API over HTTP. Refreshes itself every 4s (`RefreshTicker`). |
| `apps/api` | Express + `node:sqlite` | Sole state owner. Validates (zod), guards transitions, persists attempts + append-only history, reconciles on boot. |
| `apps/engine` | Standalone Node worker | Simulates the router: polls the jobs feed, sleeps, reports back. Never touches the DB. Restarting it loses nothing. |
| `packages/contracts` | zod schemas | Shared types so API, worker, and web agree on every shape. |

## Task lifecycle

```
created → routing → assigned → accepted   (accept is terminal)
              ↓          ↓          ↓
           created    declined | failed → routing (recover)
              ↑            (override from any non-terminal state)
```

- Every routing attempt carries a unique `routingRequestId`. Only the attempt
  matching the task's **active** request ID may transition it.
- Late, duplicate, or superseded engine answers are recorded as
  `superseded-callback-ignored` history events and change nothing (fencing).
- At most one active assignee per task (guarded in code, not just convention).
- A pending attempt older than 25s (`SUSPECT_AFTER_MS`) is flagged `suspect`
  at read time and on boot — **never auto-failed**. A slow engine can still be right.

## Data model (SQLite, WAL mode, versioned migrations)

- `tasks(id, title, expertise, priority, state, active_routing_request_id, active_assignee_id, assigned_by, created_at, updated_at)` — index on `state`.
- `contributors(id, name, expertise JSON array)`.
- `routing_attempts(request_id PK, task_id FK, status, dispatched_at, resolved_at, outcome_contributor_id, scenario JSON)` — index on `(task_id, status)`.
- `history_events(id, task_id, seq, kind, payload JSON, at)` — `UNIQUE(task_id, seq)` makes history append-only at the storage level; index on `(task_id, seq)`.
- Multi-statement transitions run in `BEGIN IMMEDIATE / COMMIT` transactions;
  `PRAGMA foreign_keys = ON`.

## Key flows

**Routine:** `POST /tasks` → `POST /tasks/:id/route` (attempt `pending`) →
worker polls → sleeps 5–20s → `POST /internal/routing-callback {matched}` →
task `assigned` → operator `accept` (terminal).

**Unresolved:** route with `{drop:true}` (or a real 20% drop) → no callback →
after 25s the board flags `suspect` → operator overrides or cancels.

**Intervention:** override mid-routing supersedes the attempt → late callback
arrives → ignored + audited, operator's choice stands.

**Recovery:** decline/fail clears the assignee (history kept) → `POST /recover`
opens a fresh attempt.

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `API_PORT` | api | `3001` | API listen port (localhost only) |
| `DB_PATH` | api | `./data/relay.db` | SQLite file |
| `SUSPECT_AFTER_MS` | api | `25000` | Live-suspect threshold (also used at boot) |
| `INTERNAL_SECRET` | api + engine | unset (open) | Shared secret gating `/internal/*`; set in any shared deployment |
| `API_BASE` | engine, web | `http://localhost:3001` | Where to reach the API |
| `ENGINE_POLL_MS` | engine | `1000` | Jobs-feed poll interval |
| `ENGINE_SEED` | engine | random | Deterministic RNG for demos |
| `CALLBACK_ATTEMPTS` / `CALLBACK_RETRY_MS` | engine | `3` / `1000` | Callback retry policy |
| `NEXT_PUBLIC_API_BASE` | web | `http://localhost:3001` | API base baked into the board |

See also: [API reference](API.md), [engine simulation](ENGINE.md),
[operator guide](OPERATOR-GUIDE.md), [decisions](DECISIONS.md).
