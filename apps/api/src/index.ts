import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db/index.js";

const PORT = Number(process.env.API_PORT ?? 3001);
const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), "data", "relay.db");

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);
migrate(db);

const app = createApp(db);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`relay-api listening on :${PORT} (db=${DB_PATH})`);
});
