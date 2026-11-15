import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db/index.js";
import { reconcileOnBoot, SUSPECT_AFTER_MS } from "./transitions.js";

const PORT = Number(process.env.API_PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), "data", "relay.db");
const SUSPECT_AFTER = Number(process.env.SUSPECT_AFTER_MS ?? SUSPECT_AFTER_MS);

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
migrate(db);
const reconciled = reconcileOnBoot(db, Date.now(), SUSPECT_AFTER);

const app = createApp(db);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`relay-api listening on :${PORT} (db=${DB_PATH}, reconciled=${reconciled})`);
});
