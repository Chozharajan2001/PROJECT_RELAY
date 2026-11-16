# ENGINE SIMULATION — PROJECT_RELAY (`apps/engine`)

A standalone worker that stands in for a real routing engine. It is intentionally
simple (matching is uniform-random among eligible contributors); its job is to be
unreliable in exactly the specified ways so the operator tooling can be exercised.

## Behavior contract

| Rule (from the brief) | Implementation |
|---|---|
| 5–20s to return | `sleep(5000 + rng() * 15000)` per claimed job |
| Picks an eligible contributor or reports no-match | Uniform pick from the poll feed's eligible list; `no-match` when the list is empty |
| 20% never return, silently | `rng() < 0.2` → job dropped, no callback, no log beyond a `dropped` line |
| Operator can't tell slow from dead | The engine gives no signal; the *API/board* flags `suspect` after 25s |

## Overrides (deterministic demos and tests)

Per-request, via `POST /tasks/:id/route`: `{"engine": …}`.

| Override | Effect |
|---|---|
| `{"delayMs": 8000}` | Answers after exactly 8s (outcome still random/matched) |
| `{"drop": true}` | Never answers, silently (forces the 20% case on demand) |
| `{"forceNoMatch": true}` | Answers `no-match` promptly |

Any non-`delayMs` override answers after a fixed **2s** (prompt for demos; the
5–20s band is reserved for the true random path). The board's Scenario buttons
(Normal / Slow 15s / Drop (silent) / No-match) send exactly these bodies.

## Poll loop

1. `GET /internal/routing-jobs` every `ENGINE_POLL_MS` (default 1s).
2. Claim unseen `requestId`s (in-memory claim set — no double-processing per run).
3. Handle each job concurrently: sleep → decide → `POST /internal/routing-callback`
   (payload validated against the shared contract before sending).
4. Callback failures (transport errors, HTTP 5xx) retry 3× with 1s backoff
   (`CALLBACK_ATTEMPTS` / `CALLBACK_RETRY_MS`); fencing responses (200/404/409)
   are the API's final word and are never retried.
5. A poisoned job (e.g. contract drift) is logged, never crashes the worker.

## Restart semantics

The worker is stateless: all durable state lives in the API's SQLite. Kill and
restart it at any point — on boot it re-polls pending jobs and re-runs them.
Duplicates are safe by construction: the API's request-ID fencing turns a second
answer into an audited no-op (`superseded-callback-ignored`). This is covered by
the scripted E2E (`npm run test:e2e --workspace apps/api`), which kills the worker
mid-flight and asserts state intactness plus clean recovery.

## Determinism

`ENGINE_SEED=n` seeds the RNG (request-scoped: `seed + hash(requestId)`), making
whole sessions reproducible. Unit tests inject fixed RNGs; the E2E suite uses
overrides exclusively — no timing flakes.
