import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db/index.js";
import { reconcileOnBoot, SUSPECT_AFTER_MS } from "./transitions.js";

const PORT = Number(process.env.API_PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), "data", "relay.db");
const SUSPECT_AFTER = Number(process.env.SUSPECT_AFTER_MS ?? SUSPECT_AFTER_MS);
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
migrate(db);
const reconciled = reconcileOnBoot(db, Date.now(), SUSPECT_AFTER);

const app = createApp(db, { internalSecret: INTERNAL_SECRET });

app.listen(PORT, "127.0.0.1", () => {
  // eslint-disable-next-line no-console
  console.log(
    `relay-api listening on 127.0.0.1:${PORT} (db=${DB_PATH}, reconciled=${reconciled}, internalAuth=${INTERNAL_SECRET !== undefined ? "secret" : "open"})`,
  );
});
