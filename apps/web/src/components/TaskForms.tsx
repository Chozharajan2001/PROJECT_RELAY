import { createTask, routeTask } from "../lib/actions";

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

export function RouteButton({ id }: { id: string }) {
  return (
    <form action={routeTask.bind(null, id)} style={{ display: "inline" }}>
      <button type="submit">Route</button>
    </form>
  );
}
