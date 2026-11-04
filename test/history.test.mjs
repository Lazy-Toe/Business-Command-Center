import test from "node:test";
import assert from "node:assert/strict";
import { groupHistory, rowLabel, changedFields, restoreOps } from "../public/app/core/history.js";

const row = (hist_id, id, op, changed_at, extra) => Object.assign({ hist_id, id, kind: "task", parent_id: null, position: 1000, data: {}, op, changed_at }, extra);

test("saman tallennuksen rivit ryhmitellään, eri aika tai laji erottaa", () => {
  const g = groupHistory([row(5, "a", "delete", "t2"), row(4, "b", "delete", "t2"), row(3, "c", "update", "t2"), row(2, "d", "update", "t1")]);
  assert.deepEqual(g.map((x) => [x.op, x.at, x.rows.length]), [["delete", "t2", 2], ["update", "t2", 1], ["update", "t1", 1]]);
});

test("nimike valitaan tutuista kentistä, sitten ensimmäisestä tekstistä", () => {
  assert.equal(rowLabel({ n: 3, name: "Nimi", title: "Otsikko" }), "Otsikko");
  assert.equal(rowLabel({ n: 3, x: "  Muu  " }), "Muu");
  assert.equal(rowLabel({ n: 3 }), "");
  assert.equal(rowLabel({ title: "a".repeat(100) }).length, 60);
});

test("muuttuneista kentistä näytetään aiempi arvo", () => {
  const f = changedFields({ a: "vanha", b: 1, c: "sama" }, { a: "uusi", b: 1, c: "sama", d: "lisätty" });
  assert.deepEqual(f, [{ key: "a", before: "vanha" }, { key: "d", before: "(ei arvoa)" }]);
});

test("muutoksen palautus säilyttää nykyisen paikan, poiston palautus vanhan", () => {
  const cur = { id: "a", parent_id: "p2", position: 7 };
  const get = (id) => (id === "a" ? cur : id === "p1" || id === "p2" ? { id } : undefined);
  const old = row(1, "a", "update", "t", { parent_id: "p1", position: 1, data: { x: "vanha" } });
  assert.deepEqual(restoreOps({ op: "update", rows: [old] }, get).rows, [{ id: "a", kind: "task", parent_id: "p2", position: 7, data: { x: "vanha" } }]);
  assert.deepEqual(restoreOps({ op: "delete", rows: [row(1, "z", "delete", "t", { parent_id: "p1", position: 3 })] }, get).rows[0].position, 3);
});

test("tallennuksen vanhin tila voittaa ja puuttuvan ylärivin lapsi ohitetaan", () => {
  const rows = [row(3, "a", "update", "t", { data: { v: "uudempi" } }), row(2, "a", "update", "t", { data: { v: "vanhin" } }), row(4, "orp", "delete", "t", { parent_id: "poissa" })];
  const r = restoreOps({ op: "update", rows }, () => undefined);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].data.v, "vanhin");
  assert.deepEqual(r.skipped, ["orp"]);
});

test("yhdessä poistettu ylärivi ja lapsi palautuvat yhdessä", () => {
  const r = restoreOps({ op: "delete", rows: [row(2, "lapsi", "delete", "t", { parent_id: "isa" }), row(1, "isa", "delete", "t")] }, () => undefined);
  assert.deepEqual(r.rows.map((x) => x.id).sort(), ["isa", "lapsi"]);
  assert.deepEqual(r.skipped, []);
});
