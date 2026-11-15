/** Human labels for history event kinds. */
export function formatEventKind(kind: string): string {
  const labels: Record<string, string> = {
    created: "Created",
    "routing-started": "Routing started",
    matched: "Engine matched",
    "no-match": "No match found",
    assigned: "Assigned",
    accepted: "Accepted",
    declined: "Declined",
    failed: "Failed",
    overridden: "Operator override",
    recovered: "Recovered",
    "superseded-callback-ignored": "Late engine answer ignored",
    "marked-suspect": "Flagged suspect",
  };
  return labels[kind] ?? kind;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
