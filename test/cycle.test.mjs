import test from "node:test";
import assert from "node:assert/strict";
import { cycleOps, CYCLE_DEFAULTS } from "../public/app/core/cycle.js";

const it = (id, kind, data = {}) => ({ id, kind, data });
const items = [
  it("p1", "phase", { title: "Selvitä" }), it("w1", "stream", { label: "Myynti" }), it("r1", "role", { title: "CEO", owner: "Mika" }), it("g", "goal", { name: "Liikevaihto" }), it("d", "metricdef", { name: "Mittari" }),
  it("t1", "task", { title: "Avoin", status: "doing", start: "2026-11-02", due: "2026-12-06", note: "vaiheessa", owner: "Mika" }),
  it("t2", "task", { title: "Valmis", status: "done", due: "2026-11-01" }),
  it("t3", "task", { title: "Alkamaton", status: "todo" }),
  it("m1", "metric", { def: "d", actual: "1520" }), it("m2", "metric", { def: "d" }), it("m3", "metric", { name: "Vapaa", actual: "5" }),
  it("f1", "form", { type: "x", rows: [] }), it("ft", "formtype", { name: "Pisteytys" })
];

test("oletus: avoimet nollataan, valmiit pois, toteumat tyhjiin, lomakkeet pois, rakenne ja tyypit säilyvät", () => {
  const ops = cycleOps(items, CYCLE_DEFAULTS);
  assert.deepEqual(ops.find((o) => o.id === "t1"), { op: "patch", id: "t1", data: { status: "todo", start: "", due: "", note: "" } });
  assert.deepEqual(ops.find((o) => o.id === "t2"), { op: "remove", id: "t2" });
  assert.equal(ops.find((o) => o.id === "t3"), undefined, "valmiiksi nollattu tehtävä ei tarvitse muutosta");
  assert.deepEqual(ops.filter((o) => o.id.startsWith("m")).map((o) => o.id), ["m1", "m3"], "vain ne, joilla on toteuma");
  assert.deepEqual(ops.find((o) => o.id === "f1"), { op: "remove", id: "f1" });
  for (const keep of ["p1", "w1", "r1", "g", "d", "ft"]) assert.equal(ops.find((o) => o.id === keep), undefined, keep + " säilyy");
  assert.equal(ops.some((o) => o.data && "owner" in o.data), false, "vastuuhenkilöt säilyvät");
});

test("valinnat: kaikki tehtävät sellaisenaan, ei tehtäviä, toteumat ja lomakkeet säilytetään", () => {
  const all = cycleOps(items, { tasks: "all", actuals: "keep", forms: "keep" });
  assert.deepEqual(all, [], "mitään ei muuteta");
  assert.deepEqual(cycleOps(items, { tasks: "none", actuals: "keep", forms: "keep" }).map((o) => o.id), ["t1", "t2", "t3"]);
  assert.deepEqual(cycleOps(items, { tasks: "all", actuals: "clear", forms: "keep" }).map((o) => o.id), ["m1", "m3"]);
  assert.deepEqual(cycleOps([], CYCLE_DEFAULTS), []);
});
