import test from "node:test";
import assert from "node:assert/strict";
import { buildMine } from "../public/app/core/mine.js";

const T = "2026-11-04";
const task = (id, data, plan = "a") => ({ plan_id: plan, id, kind: "task", parent_id: "s", data: { status: "todo", ...data } });
const items = [
  { plan_id: "a", id: "w1", kind: "stream", data: { label: "Myynti", color: "kate" } },
  { plan_id: "a", id: "r1", kind: "role", position: 2, data: { title: "Sales", owner: "Mika", stream: "w1" } },
  { plan_id: "a", id: "r2", kind: "role", position: 1, data: { title: "Tekno", owner: "Iida" } },
  { plan_id: "b", id: "r3", kind: "role", position: 1, data: { title: "Kanava", owner: " mika " } },
  { plan_id: "a", id: "m2", kind: "metric", parent_id: "r1", position: 2, data: { name: "Toinen", state: "bad" } },
  { plan_id: "a", id: "m1", kind: "metric", parent_id: "r1", position: 1, data: { name: "Ensin" } },
  { plan_id: "a", id: "mx", kind: "metric", parent_id: "r2", position: 1, data: { name: "Ei minun" } },
  task("peritty", { due: "2026-11-03", stream: "w1" }),
  task("oma", { due: T, owner: "MIKA" }),
  task("muu", { due: T, owner: "Iida" }),
  task("ilman", {}, "b"),
  task("valmis", { due: T, owner: "Mika", status: "done" })
];
const ids = (l) => l.map((x) => x.id);

test("omat tehtävät: oma tai työvirran kautta peritty vastuu, kirjainkoolla ei ole väliä, valmis ei näy", () => {
  const r = buildMine(items, "Mika", T);
  assert.deepEqual(ids(r.late), ["peritty"]);
  assert.deepEqual(ids(r.today), ["oma"]);
  assert.equal(r.open, 2);
});

test("omat scorecardit: kaikkien suunnitelmien omat vastuualueet mittareineen järjestyksessä", () => {
  const r = buildMine(items, "mika", T);
  assert.deepEqual(r.scorecards.map((s) => [s.plan_id, s.role.id]), [["a", "r1"], ["b", "r3"]]);
  assert.deepEqual(ids(r.scorecards[0].metrics), ["m1", "m2"]);
});

test("huomiota vaativat mittarit rajautuvat omiin vastuualueisiin", () => {
  assert.deepEqual(ids(buildMine(items, "Mika", T).attention), ["m2"]);
  assert.deepEqual(ids(buildMine(items, "Iida", T).attention), []);
});

test("ilman henkilöä ei näytetä mitään", () => {
  const r = buildMine(items, "", T);
  assert.equal(r.open, 0);
  assert.deepEqual(r.scorecards, []);
});
