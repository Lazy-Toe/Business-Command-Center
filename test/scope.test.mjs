import test from "node:test";
import assert from "node:assert/strict";
import { scopeFor, memberMayApply } from "../public/app/core/scope.js";

const row = (plan_id, id, kind, data, parent_id) => ({ plan_id, id, kind, parent_id, position: 1, data });
const items = [
  row("a", "w1", "stream", { label: "Myynti" }),
  row("a", "w2", "stream", { label: "Salainen työvirta" }),
  row("a", "r1", "role", { title: "Sales", owner: "Mika", stream: "w1" }),
  row("a", "r2", "role", { title: "Tekno", owner: "Iida", stream: "w2" }),
  row("a", "m1", "metric", { name: "Oma mittari", actual: "1" }, "r1"),
  row("a", "m2", "metric", { name: "Muun mittari" }, "r2"),
  row("a", "t-peritty", "task", { title: "Peritty", stream: "w1", status: "todo" }),
  row("a", "t-oma", "task", { title: "Oma", owner: "mika", stream: "w2" }),
  row("a", "t-muu", "task", { title: "Muun salainen", owner: "Iida", stream: "w1" }),
  row("a", "t-muu2", "task", { title: "Muun työvirta", stream: "w2" }),
  row("b", "t-b", "task", { title: "Toisessa", owner: "Iida" }),
  row("b", "sec", "section", { title: "Muiden osio" })
];
const ids = (l) => l.map((x) => x.id).sort();

test("jäsen saa vain omat tehtävät, vastuualueet ja mittarit sekä tarvittavat työvirrat", () => {
  const r = scopeFor(items, "Mika");
  assert.deepEqual(ids(r.items), ["m1", "r1", "t-oma", "t-peritty", "w1", "w2"]);
  const text = JSON.stringify(r.items);
  for (const secret of ["Muun salainen", "Muun mittari", "Muun työvirta", "Tekno", "Toisessa", "Muiden osio", "Iida"]) assert.ok(!text.includes(secret), secret);
});

test("peritty vastuu kirjoitetaan tehtävään ja tehtävä, jonka omistaa toinen, ei kuulu jäsenelle työvirrasta huolimatta", () => {
  const r = scopeFor(items, "Mika");
  assert.equal(r.items.find((x) => x.id === "t-peritty").data.owner, "Mika");
  assert.ok(!r.items.some((x) => x.id === "t-muu"));
  assert.ok(!items.find((x) => x.id === "t-peritty").data.owner, "alkuperäinen rivi ei muutu");
});

test("ilman henkilöä tai tuntemattomalla henkilöllä ei näy mitään", () => {
  assert.deepEqual(scopeFor(items, "").items, []);
  assert.deepEqual(scopeFor(items, "Tuntematon").items, []);
  assert.equal(scopeFor(items, null).mine.size, 0);
});

test("muutos sallitaan vain omille riveille ja sallituille kentille arvoineen", () => {
  const { mine } = scopeFor(items, "Mika");
  const ok = (ops, plan = "a") => memberMayApply(ops, plan, mine);
  assert.ok(ok([{ op: "patch", id: "t-oma", data: { status: "done", due: "2026-11-05" } }, { op: "patch", id: "m1", data: { actual: "9", state: "bad" } }]));
  for (const bad of [
    [{ op: "patch", id: "t-muu", data: { status: "done" } }],
    [{ op: "patch", id: "m2", data: { actual: "1" } }],
    [{ op: "patch", id: "r1", data: { title: "X" } }],
    [{ op: "patch", id: "t-oma", data: { owner: "Iida" } }],
    [{ op: "patch", id: "t-oma", data: { title: "X" } }],
    [{ op: "patch", id: "t-oma", data: { status: "done" }, position: 5 }],
    [{ op: "patch", id: "t-oma", data: { status: "done" }, parent_id: "r2" }],
    [{ op: "patch", id: "t-oma", data: { status: "valmis" } }],
    [{ op: "patch", id: "t-oma", data: { due: "huomenna" } }],
    [{ op: "patch", id: "m1", data: { state: "loistava" } }],
    [{ op: "patch", id: "m1", data: { actual: "x".repeat(31) } }],
    [{ op: "patch", id: "t-oma", data: {} }],
    [{ op: "patch", id: "t-oma", data: { __proto__: null, constructor: 1 } }],
    [{ op: "del", id: "t-oma" }],
    [{ op: "put", id: "t-oma", kind: "task", data: { status: "done" } }],
    [{ op: "patch", id: "t-oma", data: { status: "done" } }, { op: "patch", id: "t-muu", data: { status: "done" } }],
    []
  ]) assert.equal(ok(bad), false, JSON.stringify(bad));
  assert.equal(ok([{ op: "patch", id: "t-oma", data: { status: "done" } }], "b"), false, "toisen suunnitelman tunniste ei kelpaa");
  assert.equal(memberMayApply("x", "a", mine), false);
});
