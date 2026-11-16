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

/** Humanized one-liner for a history event payload (M-5). Falls back to compact JSON. */
export function describePayload(kind: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const short = (v: unknown) =>
    typeof v === "string" && v.length > 8 ? `#${v.slice(0, 8)}` : String(v ?? "—");
  switch (kind) {
    case "created":
      return typeof p.title === "string" ? `“${p.title}”${p.seed === true ? " (seeded)" : ""}` : "";
    case "routing-started":
      return `attempt ${short(p.requestId)}${p.scenario !== undefined ? ` · scenario: ${JSON.stringify(p.scenario)}` : ""}`;
    case "assigned":
      return `→ ${short(p.contributorId)} (by ${String(p.by ?? "?")}) · attempt ${short(p.requestId)}`;
    case "no-match":
      return `engine found no eligible contributor · attempt ${short(p.requestId)}`;
    case "accepted":
      return `accepted by ${short(p.contributorId)} — routing complete`;
    case "declined":
    case "failed":
      return `${kind} after assignment to ${short(p.contributorId)}`;
    case "overridden":
      return "action" in p && p.action === "cancel-routing"
        ? "operator cancelled the pending routing"
        : `operator assigned ${short(p.contributorId)}`;
    case "recovered":
      return "operator recovered the task for re-routing";
    case "superseded-callback-ignored":
      return `late engine answer (${String(p.outcome ?? "?")}) ignored — task already decided`;
    case "marked-suspect":
      return `pending > ${Math.round(Number(p.pendingLongerThanMs ?? 25000) / 1000)}s with no answer`;
    default:
      return JSON.stringify(payload);
  }
}
