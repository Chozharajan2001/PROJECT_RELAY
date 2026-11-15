import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db/index.js";

function testApp() {
  const dir = mkdtempSync(join(tmpdir(), "relay-api-test-"));
  const db = openDb(join(dir, "test.db"));
  migrate(db);
  return { app: createApp(db), db };
}

describe("tasks API", () => {
  it("creates a task and lists it with state created and age", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit Q3 books", expertise: "finance", priority: "high" })
      .expect(201);
    expect(created.body.state).toBe("created");
    expect(created.body.activeAssigneeId).toBeNull();

    const list = await request(app).get("/tasks").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0].state).toBe("created");
    expect(list.body[0].ageSeconds).toBeGreaterThanOrEqual(0);
    db.close();
  });

  it("rejects empty title, unknown expertise, and bad priority with 400", async () => {
    const { app, db } = testApp();
    await request(app).post("/tasks").send({ title: "", expertise: "finance" }).expect(400);
    await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "astrophysics" })
      .expect(400);
    await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "finance", priority: "urgent" })
      .expect(400);
    db.close();
  });

  it("serves the contributor directory (empty before seeding)", async () => {
    const { app, db } = testApp();
    const res = await request(app).get("/contributors").expect(200);
    expect(res.body).toEqual([]);
    db.close();
  });
});
