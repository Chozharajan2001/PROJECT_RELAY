# API REFERENCE — PROJECT_RELAY (`apps/api`, default `http://localhost:3001`)

Conventions: JSON everywhere. Validation errors → `400` (zod details included).
Unknown task/request → `404`. Illegal transition (terminal state, duplicate route,
no pending routing to cancel) → `409` with a `code`. Engine-callback failures are
retried by the worker; operator endpoints never retry — the board re-fetches anyway.

## Operator endpoints

### `GET /tasks`
Board feed. Each task carries live `ageSeconds` and a read-time `suspect` flag.
```json
[{ "id": "…", "title": "Audit Q3 books", "expertise": "finance",
   "priority": "high", "state": "routing", "ageSeconds": 31, "suspect": true,
   "activeAssigneeId": null, "assignedBy": null, "createdAt": "…", "updatedAt": "…" }]
```

### `POST /tasks`
Create a task (always starts in `created`). Body: `{title (1–200 chars), expertise
(one of finance|healthcare|data-analysis|operations|legal), priority? (default normal)}`.
→ `201` with the task. Unknown expertise → `400`.

### `GET /contributors`
Directory: `[{id, name, expertise[]}]`. Populated by `npm run seed`.

### `POST /tasks/:id/route`
Start a routing attempt. Body (all optional): `{"engine": {"delayMs": n} | {"drop": true} | {"forceNoMatch": true}}` — deterministic demo/test controls (see [ENGINE.md](ENGINE.md)). Absent = true random engine.
→ `202 {requestId, taskId, status:"pending"}`. Duplicate/terminal → `409`.

### `POST /tasks/:id/override`
Intervene any time: `{"contributorId": "…"}` assigns (replaces), `{"cancel": true}`
cancels a pending routing. Supersedes the active attempt. Accepted tasks → `409`.
→ `200` with the updated task.

### `POST /tasks/:id/recover`
From `declined`/`failed`: `{}` re-routes (→ `202`), or `{"contributorId"}` assigns
directly (→ `200`). Response is the updated task.

### `POST /tasks/:id/decision`
Body: `{"decision": "accept" | "decline" | "fail"}`. Only valid from `assigned`;
`accept` is terminal (further transitions → `409`). Response is the updated task.

### `GET /tasks/:id/history`
Ordered audit trail: `[{id, seq, kind, payload, at}]`. Kinds: `created`,
`routing-started`, `matched`, `no-match`, `assigned`, `accepted`, `declined`,
`failed`, `overridden`, `recovered`, `superseded-callback-ignored`, `marked-suspect`.

## Internal endpoints (engine only)

Bound to localhost; gated by `INTERNAL_SECRET` header `x-relay-internal-secret`
when configured (otherwise open for local dev).

### `GET /internal/routing-jobs`
Poll feed: pending (+suspect) attempts whose task is still `routing`, each with
task title/expertise/priority, eligible contributors, and the stored scenario override.

### `POST /internal/routing-callback`
Body: `{routingRequestId, outcome: "matched"|"no-match", contributorId?}`.
- Applied (active ID, valid state) → `200 {applied:true}`.
- Known but stale/settled → `200 {applied:false, reason:"stale-request-id"}` (audited, no state change).
- Unknown request ID → `404`. Invalid body → `400`. Other `StateError` → `409`.

## Worked example (curl)

```bash
T=$(curl -s localhost:3001/tasks -H 'content-type: application/json' \
  -d '{"title":"Audit Q3 books","expertise":"finance","priority":"high"}' | node -p "JSON.parse(require('fs').readFileSync(0)).id")
R=$(curl -s localhost:3001/tasks/$T/route -X POST -H 'content-type: application/json' -d '{}' | node -p "JSON.parse(require('fs').readFileSync(0)).requestId")
sleep 22 && curl -s localhost:3001/tasks | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).find(t=>t.id==='$T').state))"
```
