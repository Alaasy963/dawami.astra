import { beforeEach, afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("packages/db/migrations")
    .filter((x) => x.endsWith(".sql"))
    .sort())
    db.exec(readFileSync("packages/db/migrations/" + file, "utf8"));
  db.exec(`INSERT INTO companies(id,name,currency,ends_at,created_at) VALUES('a','A','EUR',1,1),('b','B','EUR',1,1);
 INSERT INTO users(id,phone,name,password_hash) VALUES('u','+123','Test','unused');
 INSERT INTO memberships(id,company_id,user_id,role) VALUES('ma','a','u','gm'),('mb','b','u','gm');`);
});
afterEach(() => db.close());
function shift(id = "s1", version = 1, start = 480, end = 960, actor = "ma") {
  db.prepare(
    "INSERT INTO shift_versions(id,company_id,template_id,version,name,start_minute,end_minute,actor,created_at) VALUES(?,'a','template',?,'Morning',?,?,?,1)",
  ).run(id, version, start, end, actor);
}
function plan(
  id = "p1",
  version = 1,
  date = "2026-10-29",
  member = "ma",
  actor = "ma",
  json = '{"startMinute":480}',
) {
  db.prepare(
    "INSERT INTO work_plan_versions(id,company_id,membership_id,version,effective_from,timezone,plan,actor,reason,created_at) VALUES(?,'a',?,?,?,'Europe/Berlin',?,?,'Assigned schedule',1)",
  ).run(id, member, version, date, json, actor);
}
it("applies the complete migration chain and retains independent tenant memberships", () => {
  expect(
    db.prepare("SELECT count(*) AS count FROM memberships").get()?.count,
  ).toBe(2);
  shift();
  plan();
});
it("rejects cross-company subjects and authors", () => {
  expect(() => shift("s", 1, 480, 960, "mb")).toThrow();
  expect(() => plan("p", 1, "2026-10-29", "mb")).toThrow();
  expect(() => plan("p", 1, "2026-10-29", "ma", "mb")).toThrow();
});
it("keeps historical plans unchanged after a template revision", () => {
  shift();
  plan();
  shift("s2", 2, 600, 1080);
  expect(
    JSON.parse(
      String(
        db.prepare("SELECT plan FROM work_plan_versions WHERE id='p1'").get()
          ?.plan,
      ),
    ),
  ).toEqual({ startMinute: 480 });
});
it.each(["shift_versions", "work_plan_versions"])(
  "makes %s append-only",
  (table) => {
    shift();
    plan();
    expect(() => db.exec(`UPDATE ${table} SET version=2`)).toThrow(
      /append_only/,
    );
    expect(() => db.exec(`DELETE FROM ${table}`)).toThrow(/append_only/);
  },
);
it("rejects duplicate version numbers", () => {
  shift();
  plan();
  expect(() => shift("s2")).toThrow();
  expect(() => plan("p2")).toThrow();
});
it.each(["2026-02-30", "2026-13-01", "2026-1-01"])(
  "rejects invalid effective date %s",
  (date) => {
    expect(() => plan("p", 1, date)).toThrow();
  },
);
it("selects the latest revision effective on the requested date", () => {
  plan();
  plan("p2", 2, "2026-11-01");
  plan("p3", 3, "2026-11-01");
  const q = db.prepare(
    "SELECT id FROM work_plan_versions WHERE company_id=? AND membership_id=? AND effective_from<=? ORDER BY effective_from DESC,version DESC LIMIT 1",
  );
  expect(q.get("a", "ma", "2026-10-28")).toBeUndefined();
  expect(q.get("a", "ma", "2026-10-30")?.id).toBe("p1");
  expect(q.get("a", "ma", "2026-11-01")?.id).toBe("p3");
  expect(q.get("b", "ma", "2026-11-01")).toBeUndefined();
});
it("rejects malformed snapshots and invalid shift bounds", () => {
  expect(() => plan("p", 1, "2026-10-29", "ma", "ma", "[]")).toThrow();
  expect(() => plan("p", 1, "2026-10-29", "ma", "ma", "bad")).toThrow();
  expect(() => shift("s", 1, -1, 960)).toThrow();
  expect(() => shift("s", 1, 480, 480)).toThrow();
});
