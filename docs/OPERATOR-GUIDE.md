# OPERATOR GUIDE — PROJECT_RELAY board (`http://localhost:3000`)

The board refreshes itself every 4 seconds, so engine-side changes appear without
reloading. Anything you do here is confirmed by toast; failures say why.

## The four situations

### 1. Routine assignment
1. Click **+ New task**, fill title/expertise/priority, tick **Create & route**.
2. The row appears as `created`, then `routing`. Wait 5–20s (real engine time).
3. It flips to `assigned → Name (E)`. Open the title for the timeline:
   `Created → Routing started → Assigned`.
4. Click **accept** when the work is confirmed. `accepted` is terminal.

### 2. Unresolved routing (stuck task)
1. Route with the **Drop (silent)** preset — or wait for a real 20% drop.
2. The row stays `routing`. You cannot know if it is slow or dead — that is the point.
3. After 25s it flags **`⚠ suspect — may never return`**. Act on it:
   **Intervene…** to assign manually, or **Cancel routing** to send it back to `created`.

### 3. Human intervention (the headline move)
1. While any task is `routing`, open **Intervene…**: pick a contributor (match notes
   shown), confirm. Your choice wins immediately.
2. If the engine's answer arrives late, nothing changes — the detail timeline shows
   `Late engine answer ignored`, and your assignee stands.

### 4. Recovery
1. On an `assigned` task, **decline** (contributor refused) or **fail** (fell through).
2. Click **Recover…** → **Re-route**. A new attempt starts with a fresh ID; the old
   history is preserved above it.
3. Confirm with **accept** (or decline/fail again — the loop is safe to repeat).

## Reading the board

- **Stats strip**: `Routing N · Assigned N · Suspect N` — plus a screen-reader line.
- **Suspect rows** are amber-highlighted; the API pill shows `● API live` (or retry when down).
- **Scenario buttons** (Normal / Slow 15s / Drop (silent) / No-match) are demo
  fault-injection, not product routing modes — see [ENGINE.md](ENGINE.md).
- **Filters** (search, state, expertise, suspect-only) are shareable via the URL.
