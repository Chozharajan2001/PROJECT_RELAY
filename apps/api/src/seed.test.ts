import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db/index.js";
import { runSeed } from "./seed.js";

describe("seed", () => {
  it("is idempotent and exposes the legal no-match path", () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-seed-test-"));
    const dbPath = join(dir, "seed.db");
    const first = runSeed(dbPath);
    expect(first).toEqual({ contributors: 10, tasks: 20 });
    expect(runSeed(dbPath)).toEqual({ contributors: 10, tasks: 20 });

    const db = openDb(dbPath);
    const legalHolders = db.prepare("SELECT id FROM contributors").all() as Array<{
      id: string;
    }>;
    expect(legalHolders).toHaveLength(10);
    const withLegal = db
      .prepare("SELECT id FROM contributors WHERE expertise LIKE '%legal%'")
      .all();
    expect(withLegal).toEqual([]);
    const legalTask = db
      .prepare("SELECT id, state FROM tasks WHERE id = 'seed-t20'")
      .get() as { id: string; state: string };
    expect(legalTask.state).toBe("created");
    db.close();
  });
});
