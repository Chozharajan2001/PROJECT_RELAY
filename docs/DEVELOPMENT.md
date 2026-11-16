# DEVELOPMENT — PROJECT_RELAY

## Setup

```bash
node --version   # ≥ 20 required
npm install
npm run seed --workspace apps/api   # 20 tasks + 10 contributors (idempotent)
npm run dev        # api :3001 · engine worker · web :3000
```

## Scripts

| Command | Where | What |
|---|---|---|
| `npm run dev` | root | All three processes (builds contracts first) |
| `npm run typecheck` | root / each workspace | `tsc --noEmit` everywhere |
| `npm run test` | root / each workspace | vitest suites (deterministic: mocked timers, seeded RNG, temp DBs) |
| `npm run test:e2e` | `apps/api` | Scripted live E2E: 4 use cases + kill-restart (~40s, self-reported count) |
| `npm run seed` | `apps/api` | Idempotent seed (fixed IDs, `INSERT OR IGNORE`); honors `DB_PATH` |
| `npm run build` / `start` | each app | `tsc` emit / run compiled output (+ `next build` for web) |

## Test pyramid

- **Unit** (~50): contracts (schema accept/reject), transitions (fencing, terminal
  accept, reconcile), engine decisions (delays, drops, overrides), board shaping.
- **Integration** (~15): HTTP-level API tests against temp SQLite files
  (endpoints, status mapping, suspect feed, secret gating).
- **E2E** (14 scripted checks): real API + real worker processes — routine,
  unresolved→live-suspect, no-match, intervention+fencing, decline→recover→accept,
  terminal enforcement, kill-mid-flight→restart→assigned.

## Environment

All config is environmental (see [ARCHITECTURE.md](ARCHITECTURE.md#configuration)):
`API_PORT`, `DB_PATH`, `SUSPECT_AFTER_MS`, `INTERNAL_SECRET`, `API_BASE`,
`ENGINE_POLL_MS`, `ENGINE_SEED`, `CALLBACK_ATTEMPTS`, `CALLBACK_RETRY_MS`,
`NEXT_PUBLIC_API_BASE`.

## Layout

```
apps/web          Next.js board (app/, src/lib, src/components)
apps/api          Express API (src/{app,store,transitions,db,index,seed}.ts, e2e/)
apps/engine       Worker (src/{engine,worker,index}.ts)
packages/contracts  zod schemas + inferred types
docs/             This documentation
```

## Conventions (enforced in review)

- Routes → services → store; engine never touches the DB; API owns all writes.
- Every external input validated with zod; `StateError` → HTTP via one mapper.
- No `any`, no secrets in code, no `console.log` in committed product code
  (structured `console.error` for operator-visible failures only).
- Small diffs (≤~200 lines per task); tests first for behavior changes.
- Branches: `epic/…` / `feature/…`; commit locally on green; **never push or merge
  without explicit human approval**.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `EADDRINUSE :3001` | Stale node process: kill all `node.exe`, then boot |
| Board shows API unreachable | API not running or wrong port; check `:3001/health` |
| `*.db-journal` / `.next` noise in `git status` | They are gitignored; run `git clean -ndx <path>` to preview strays |
| Next 404s after moving files | Delete `apps/web/.next` (regenerates) |
| Worker polls but nothing assigns | Check the attempt isn't `{drop:true}`; check API logs for callback errors |
