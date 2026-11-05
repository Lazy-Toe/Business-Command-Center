import test from "node:test";
import assert from "node:assert/strict";
import { scopeFor, memberMayApply } from "../public/app/core/scope.js";
import { virtualId } from "../public/app/core/scorecard.js";

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
  assert.deepEqual(ids(r.items), ["m1", "r1", "t-oma", "w1", "w2"]);
  const text = JSON.stringify(r.items);
  for (const secret of ["Muun salainen", "Muun mittari", "Muun työvirta", "Tekno", "Toisessa", "Muiden osio", "Iida"]) assert.ok(!text.includes(secret), secret);
});

test("tehtävä kuuluu jäsenelle vain valitun vastuuhenkilön kautta: työvirta ei siirrä sitä, ja toisen tehtävä ei kuulu työvirrasta huolimatta", () => {
  const r = scopeFor(items, "Mika");
  assert.ok(!r.items.some((x) => x.id === "t-peritty"), "pelkkä työvirta ei riitä");
  assert.ok(!r.items.some((x) => x.id === "t-muu"));
  assert.equal(r.items.find((x) => x.id === "t-oma").data.owner, "Mika");
});

test("ilman henkilöä tai tuntemattomalla henkilöllä ei näy mitään", () => {
  assert.deepEqual(scopeFor(items, "").items, []);
  assert.deepEqual(scopeFor(items, "Tuntematon").items, []);
  assert.equal(scopeFor(items, null).mine.size, 0);
});

test("muutos sallitaan vain omille riveille ja sallituille kentille arvoineen", () => {
  const { mine } = scopeFor(items, "Mika");
  const ok = (ops, plan = "a") => memberMayApply(ops, plan, mine);
  assert.ok(ok([{ op: "patch", id: "t-oma", data: { status: "done", due: "2026-11-05" } }, { op: "patch", id: "m1", data: { actual: "9" } }]));
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
    [{ op: "patch", id: "m1", data: { state: "bad" } }],
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

// Mallipohjaiset tavoitteet: katalogi, automaattinen jako työvirran mukaan ja tallentamattoman rivin ensimmäinen kirjaus.
const defRow = (id, data, plan = "a") => ({ plan_id: plan, id, kind: "metricdef", parent_id: "g1", position: 1, data });
const catalog = [
  ...items,
  row("a", "g1", "goal", { name: "Liikevaihto" }),
  defRow("d-oma", { name: "Oma malli", stream: "w1", target: "100", formula: "ACTUAL / TARGET" }),
  defRow("d-muu", { name: "Muiden malli SALAINEN", stream: "w2", target: "5" }),
  defRow("d-lisa", { name: "Lisätty malli", stream: "w2" }),
  defRow("d-piilo", { name: "Piilotettu malli", stream: "w1" }),
  row("a", "mr-lisa", "metric", { def: "d-lisa", actual: "3" }, "r1"),
  row("a", "mr-muu", "metric", { def: "d-muu", actual: "9" }, "r2")
];
catalog.find((x) => x.id === "r1").data.hide = ["d-piilo"];

test("jäsen näkee vain oman roolinsa mallit ja rivit, ei katalogia eikä muiden malleja", () => {
  const r = scopeFor(catalog, "Mika");
  assert.deepEqual(ids(r.items), ["d-lisa", "d-oma", "m1", "mr-lisa", "r1", "t-oma", "w1", "w2"]);
  const text = JSON.stringify(r.items);
  for (const secret of ["SALAINEN", "Piilotettu", "Liikevaihto", "mr-muu", "d-muu"]) assert.ok(!text.includes(secret), secret);
  assert.equal(r.mine.get("a/" + virtualId("r1", "d-oma")).kind, "vmetric", "tallentamaton rivi on kirjattavissa");
  assert.equal(r.mine.get("a/mr-lisa"), "metric", "tallennettu rivi on muutettavissa");
  assert.ok(!r.mine.has("a/" + virtualId("r1", "d-piilo")), "piilotettua ei voi kirjata");
  assert.ok(!r.mine.has("a/" + virtualId("r1", "d-muu")), "toisen työvirran mallia ei tule itsestään");
});

test("tallentamattoman rivin ensimmäinen kirjaus sallitaan vain sovitulla tunnisteella ja kentillä", () => {
  const { mine } = scopeFor(catalog, "Mika"), vid = virtualId("r1", "d-oma");
  const put = (o) => ({ op: "put", id: vid, kind: "metric", parent_id: "r1", data: { def: "d-oma", actual: "90" }, ...o });
  assert.ok(memberMayApply([put()], "a", mine));
  assert.ok(memberMayApply([put({ data: { def: "d-oma" } })], "a", mine), "pelkkä rivi ilman toteumaa");
  for (const bad of [
    put({ id: "v-oma-keksitty" }), put({ id: virtualId("r1", "d-piilo") }), put({ id: virtualId("r2", "d-muu") }),
    put({ kind: "task" }), put({ kind: "section" }), put({ parent_id: "r2" }), put({ parent_id: null }), put({ position: 1 }),
    put({ data: { def: "d-muu", actual: "1" } }), put({ data: { def: "d-oma", actual: "1", target: "1" } }), put({ data: { def: "d-oma", actual: "x".repeat(31) } }),
    put({ data: { def: "d-oma", actual: 5 } }), put({ data: {} }), put({ data: null }), put({ data: ["d-oma"] }),
    { op: "put", id: "t-oma", kind: "task", parent_id: null, data: { status: "done" } },
    { op: "put", id: "mr-lisa", kind: "metric", parent_id: "r1", data: { def: "d-lisa", actual: "1" } }
  ]) assert.equal(memberMayApply([bad], "a", mine), false, JSON.stringify(bad));
  assert.equal(memberMayApply([put(), { op: "patch", id: "t-muu", data: { status: "done" } }], "a", mine), false, "yksi huono hylkää koko erän");
  assert.equal(memberMayApply([put()], "b", mine), false, "toisen suunnitelman tunniste ei kelpaa");
});

test("jäsen näkee vastuualueensa kaikkien työvirtojen mallit ja nimet, ei muita", async () => {
  const mod = await import("../public/app/core/scope.js");
  const fn = Object.values(mod).find((f) => typeof f === "function" && /person/.test(String(f).slice(0, 80)) && /mine/.test(String(f)));
  const row = (id, kind, data, parent_id = null) => ({ plan_id: "p", id, kind, parent_id, position: 1, data });
  const items = [row("a", "stream", { label: "A" }), row("b", "stream", { label: "B" }), row("c", "stream", { label: "C" }),
    row("r", "role", { owner: "Harri", streams: ["a", "b"], stream: "a" }), row("g", "goal", { name: "G" }),
    row("da", "metricdef", { name: "A", stream: "a" }, "g"), row("db", "metricdef", { name: "B", stream: "b" }, "g"), row("dc", "metricdef", { name: "C", stream: "c" }, "g")];
  const R = fn(items, "Harri"), ids = R.items.map((x) => x.id);
  assert.ok(ids.includes("a") && ids.includes("b") && !ids.includes("c"));
  assert.ok(ids.includes("da") && ids.includes("db") && !ids.includes("dc"));
});
