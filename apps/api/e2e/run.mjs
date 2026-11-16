// T-5.1.2 E2E: the 4 assignment use cases + kill-mid-flight/restart (O-3 gate).
// Boots a real API (temp DB, SUSPECT_AFTER_MS=3s) and real worker processes;
// everything is deterministic via per-request engine overrides.
// Run: npm run test:e2e --workspace apps/api   (exit 0 = all green)
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const API_PORT = 3901;
const API = `http://localhost:${API_PORT}`;
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");

const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name} ${extra}`);
  }
}
async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${API}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error("API never came up");
}

const dir = mkdtempSync(join(tmpdir(), "relay-e2e-"));
const dbPath = join(dir, "e2e.db");
let apiProc = null;
let workerProc = null;
function startApi() {
  apiProc = spawn(process.execPath, [TSX_CLI, "src/index.ts"], {
    cwd: join(ROOT, "apps/api"),
    env: { ...process.env, DB_PATH: dbPath, API_PORT: String(API_PORT), SUSPECT_AFTER_MS: "3000" },
    stdio: "ignore",
  });
}
function startWorker() {
  workerProc = spawn(process.execPath, [TSX_CLI, "src/index.ts"], {
    cwd: join(ROOT, "apps/engine"),
    env: { ...process.env, API_BASE: API, ENGINE_POLL_MS: "300" },
    stdio: "ignore",
  });
}
async function stopWorker() {
  if (!workerProc) return;
  workerProc.kill();
  await sleep(1000);
  workerProc = null;
}
function seedContributor() {
  const db = new DatabaseSync(dbPath);
  db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
    "c1",
    "Asha",
    JSON.stringify(["finance"]),
  );
  db.close();
}

try {
  startApi();
  await waitForHealth();
  seedContributor();
  startWorker();
  await sleep(1500); // worker online before the first route

  console.log("UC-1 routine assignment");
  {
    const t = (await api("POST", "/tasks", { title: "Routine books", expertise: "finance" })).json;
    const r = (await api("POST", `/tasks/${t.id}/route`, { engine: { delayMs: 500 } })).json;
    check("route accepted", r.status !== undefined && r.requestId !== undefined);
    await sleep(3000);
    const list = (await api("GET", "/tasks")).json;
    const row = list.find((x) => x.id === t.id);
    check("assigned to c1", row.state === "assigned" && row.activeAssigneeId === "c1", JSON.stringify(row));
    const hist = (await api("GET", `/tasks/${t.id}/history`)).json;
    check(
      "history created→routing→assigned",
      hist.map((h) => h.kind).join(",") === "created,routing-started,assigned",
      JSON.stringify(hist.map((h) => h.kind)),
    );
  }

  console.log("UC-2 unresolved routing (drop → live suspect)");
  {
    const t = (await api("POST", "/tasks", { title: "Stuck case", expertise: "finance", priority: "high" })).json;
    await api("POST", `/tasks/${t.id}/route`, { engine: { drop: true } });
    await sleep(1500);
    let row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("still routing, not yet suspect", row.state === "routing" && row.suspect === false);
    await sleep(3000);
    row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("flagged suspect live, no restart", row.suspect === true, JSON.stringify(row));
  }

  console.log("UC-2b explicit no-match");
  {
    const t = (await api("POST", "/tasks", { title: "Legal q", expertise: "legal" })).json;
    await api("POST", `/tasks/${t.id}/route`, { engine: { forceNoMatch: true } });
    await sleep(4000);
    const row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("back to created", row.state === "created", JSON.stringify(row));
  }

  console.log("UC-3 human intervention + late callback fenced");
  {
    const t = (await api("POST", "/tasks", { title: "Hot case", expertise: "finance" })).json;
    await api("POST", `/tasks/${t.id}/route`, { engine: { delayMs: 2000 } });
    await sleep(500);
    const ov = await api("POST", `/tasks/${t.id}/override`, { contributorId: "c1" });
    check("override wins", ov.status === 200 && ov.json.state === "assigned");
    await sleep(4000); // engine answer lands late
    const row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("still assigned to c1", row.state === "assigned" && row.activeAssigneeId === "c1");
    const hist = (await api("GET", `/tasks/${t.id}/history`)).json;
    check(
      "late callback audited",
      hist.map((h) => h.kind).includes("superseded-callback-ignored"),
      JSON.stringify(hist.map((h) => h.kind)),
    );
  }

  console.log("UC-4 recovery: decline → recover → accept (terminal)");
  {
    const t = (await api("POST", "/tasks", { title: "Fragile case", expertise: "finance" })).json;
    const r = (await api("POST", `/tasks/${t.id}/route`, { engine: { delayMs: 500 } })).json;
    await api("POST", "/internal/routing-callback", {
      routingRequestId: r.requestId,
      outcome: "matched",
      contributorId: "c1",
    });
    await api("POST", `/tasks/${t.id}/decision`, { decision: "decline" });
    const rec = await api("POST", `/tasks/${t.id}/recover`, {});
    check("recover re-routes (202)", rec.status === 202 && rec.json.state === "routing");
    const r2 = rec.json.activeRoutingRequestId;
    await api("POST", "/internal/routing-callback", {
      routingRequestId: r2,
      outcome: "matched",
      contributorId: "c1",
    });
    await api("POST", `/tasks/${t.id}/decision`, { decision: "accept" });
    const fin = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("accepted terminal", fin.state === "accepted");
    const blocked = await api("POST", `/tasks/${t.id}/override`, { contributorId: "c1" });
    check("override on accepted = 409", blocked.status === 409);
  }

  console.log("O-3 kill worker mid-flight → restart → state intact");
  {
    await stopWorker();
    startWorker();
    await sleep(1500);
    const t = (await api("POST", "/tasks", { title: "Kill me", expertise: "finance" })).json;
    await api("POST", `/tasks/${t.id}/route`, { engine: { delayMs: 8000 } });
    await sleep(2500);
    await stopWorker(); // dead mid-sleep
    let row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("mid-kill: routing, no assignee", row.state === "routing" && row.activeAssigneeId === null);
    startWorker();
    await sleep(11000); // re-poll + re-sleep 8s + callback
    row = (await api("GET", "/tasks")).json.find((x) => x.id === t.id);
    check("after restart: assigned c1", row.state === "assigned" && row.activeAssigneeId === "c1", JSON.stringify(row));
    await stopWorker();
  }
} finally {
  if (workerProc) workerProc.kill();
  if (apiProc) apiProc.kill();
}

console.log(failures === 0 ? "E2E ALL GREEN" : `E2E ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
