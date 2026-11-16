# DECISIONS — PROJECT_RELAY (ADRs)

Significant, load-bearing choices. Each: context → decision → rejected alternatives.
New significant choices get the next number in this file's sequence.

## ADR-001 — Stale-routing policy: 25s suspect flag + request-ID fencing (accepted)

- *Context:* the engine drops 20% of requests silently; the operator cannot
  distinguish slow from dead.
- *Decision:* pending attempts older than 25s are flagged `suspect` — computed at
  read time and written by boot reconcile, but **never auto-failed**. Every attempt
  carries `routingRequestId`; only the task's active ID may transition it.
  Late/superseded callbacks become `superseded-callback-ignored` history events.
- *Rejected:* age-only display (weaker demo, no operator trigger); auto-fail at N s
  (invents knowledge the operator lacks; hides the fencing problem).

## ADR-002 — SQLite with API-owned writes (accepted)

- *Context:* state must survive refresh/restart; two processes need access.
- *Decision:* SQLite in WAL mode; the API is the sole writer (`BEGIN IMMEDIATE`
  transactions, FK enforcement on). The engine reports via callback and never
  touches the DB. Boot reconcile marks orphaned `pending` attempts `suspect`.
- *Rejected:* JSON file store (racy); Postgres (overkill for local demo; migrate
  later behind the store boundary if needed).

## ADR-003 — Simple engine simulator with per-request overrides (accepted)

- *Context:* matching sophistication is explicitly out of scope; demos/tests need
  determinism against 20% randomness.
- *Decision:* out-of-process worker, basic expertise matching, 5–20s delay, 20%
  silent drop, explicit no-match. `{"engine": {"delayMs"} | {"drop": true} |
  {"forceNoMatch": true}}` overrides force outcomes for demos/tests (non-`delayMs`
  overrides answer after a fixed 2s); default path stays truly random.
- *Rejected:* seeded RNG (fragile across extra clicks); global kill-switch
  (all-or-nothing, kills single-session mixed demos).

## ADR-004 — Engine transport: poll, not push (accepted)

- *Context:* early design said the API "dispatches" jobs to the worker.
- *Decision:* **pull** — the engine polls `GET /internal/routing-jobs` and reports
  via `POST /internal/routing-callback`. The API never initiates contact.
- *Rejected:* push (fails the write path on engine downtime; needs a retry queue +
  redelivery dedup on the API); shared-DB reads (breaks the callback-only boundary
  that justifies the separate process).
