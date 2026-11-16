# CHANGELOG — PROJECT_RELAY

Format: Keep a Changelog. Dates are commit days (YYYY-MM-DD).

## [Unreleased]

## 2026-11-16 — EPIC-6 UX redesign + E2E-count fix
- Board redesign per Figma S1–S8: design tokens + dark mode, page metadata +
  favicon, toast/pending/reset on all actions, responsive table→cards, stats strip,
  filters + search, state badges + suspect row tint, priority chips, assignee source
  marks, scope/caption/skip-link, Create/Intervene/Recover modals, armed destructive
  confirms, detail page with humanized timeline + actions + live refresh, empty CTA,
  API status pill + retry, loading skeletons.
- E2E runner self-reports its check count (14/14 authoritative).

## 2026-11-16 — EPIC-5: seed, audit fixes, scripted E2E
- Seed script: 20 tasks + 10 contributors, idempotent (T-5.1.1).
- P1–P5 audit batch: live suspect flag at read time, feed state filter +
  supersede-covers-suspect, localhost bind + optional internal secret, 4s board
  ticker, WAL gitignore; transactions on all transitions; FK enforcement;
  action error logging; unified StateError→HTTP mapping.
- Scripted E2E (`apps/api/e2e/run.mjs`): routine, unresolved→live suspect,
  no-match, intervention+fencing, decline→recover→accept, terminal enforcement,
  kill-mid-flight→restart (T-5.1.2, O-3 gate satisfied).
- Cancel scoped to routing rows; README documents seed + E2E.

## 2026-11-15 — EPIC-4: operator board
- Task list with ticking ages, state badges incl. suspect, candidates; create form
  + per-row Route; inline intervene/decision/recover controls; task detail with
  ordered history timeline; scenario preset buttons (Normal/Slow/Drop/No-match)
  with prompt override answers.

## 2026-11-15 — EPIC-3: routing engine simulator
- Out-of-process worker: poll loop, 5–20s delays, 20% silent drops, expertise
  matching, per-request overrides, seeded RNG; callback retries (incl. 5xx);
  poisoned-job protection; stateless restart safety proven live.

## 2026-11-15 — EPIC-2: assignment core (API + state)
- SQLite schema v1–v2 with versioned idempotent migrations; task/contributor
  endpoints with validation and server-computed age; state-machine guard
  (request-ID fencing, ≤1 assignee, terminal accept); route endpoint + poll feed;
  engine callback with stale-ignore; boot reconcile (stale → suspect);
  override/recover/decision/history endpoints. Engine transport fixed as poll (ADR-004).

## 2026-11-15 — EPIC-1: monorepo foundation
- npm workspaces (`apps/web`, `apps/api`, `apps/engine`, `packages/contracts`);
  zod contracts (tasks, contributors, attempts, history, callbacks, overrides);
  README with run/verify/seed instructions.
