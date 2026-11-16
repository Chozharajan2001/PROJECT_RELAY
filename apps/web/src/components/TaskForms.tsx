import { cancelRoute, createTask, decideTask, overrideAssign, recoverTask, routeTask } from "../lib/actions";

const EXPERTISE = ["finance", "healthcare", "data-analysis", "operations", "legal"] as const;

export function CreateForm() {
  return (
    <form action={createTask} style={{ display: "flex", gap: 8, margin: "16px 0", flexWrap: "wrap" }}>
      <input name="title" placeholder="Task title" required maxLength={200} style={{ flex: 2 }} />
      <select name="expertise" defaultValue="finance" aria-label="expertise">
        {EXPERTISE.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
      <select name="priority" defaultValue="normal" aria-label="priority">
        <option value="low">low</option>
        <option value="normal">normal</option>
        <option value="high">high</option>
      </select>
      <button type="submit">Create task</button>
    </form>
  );
}

/** Labeled demo presets (ADR-003): each drives the matching engine path. */
export function ScenarioButtons({ id }: { id: string }) {
  const presets = [
    { key: undefined, label: "Normal" },
    { key: "slow", label: "Slow 15s" },
    { key: "drop", label: "Drop" },
    { key: "no-match", label: "No-match" },
  ] as const;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }} aria-label="scenario presets">
      {presets.map((p) => (
        <form
          key={p.label}
          action={routeTask.bind(null, id, p.key, undefined)}
          style={{ display: "inline" }}
        >
          <button type="submit" title={`Route with scenario: ${p.label}`}>
            {p.label}
          </button>
        </form>
      ))}
    </span>
  );
}

/** Manual assign (override) + cancel, for routing tasks. Assigned tasks get reassign only. */
export function InterveneControls({
  id,
  candidates,
  allowCancel,
}: {
  id: string;
  candidates: { id: string; name: string }[];
  allowCancel: boolean;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      <form action={overrideAssign.bind(null, id)} style={{ display: "inline-flex", gap: 4 }}>
        <select name="contributorId" aria-label="assignee" defaultValue={candidates[0]?.id ?? ""}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" disabled={candidates.length === 0}>
          Assign
        </button>
      </form>
      {allowCancel ? (
        <form action={cancelRoute.bind(null, id)} style={{ display: "inline" }}>
          <button type="submit">Cancel</button>
        </form>
      ) : null}
    </span>
  );
}

/** Accept / decline / fail, for assigned tasks. */
export function DecisionButtons({ id }: { id: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      {(["accept", "decline", "fail"] as const).map((d) => (
        <form key={d} action={decideTask.bind(null, id, d)} style={{ display: "inline" }}>
          <button type="submit">{d}</button>
        </form>
      ))}
    </span>
  );
}

/** Re-route a declined/failed task. */
export function RecoverButton({ id }: { id: string }) {
  return (
    <form action={recoverTask.bind(null, id)} style={{ display: "inline" }}>
      <button type="submit">Recover</button>
    </form>
  );
}
