import test from "node:test";
import assert from "node:assert/strict";
import { taskRows, filterRows, bulkPatches, invertPatches, ownersIn, groupRows, periodOptions, lastDay, STATUS_LABEL } from "../public/app/core/tasks-table.js";

const plans = [{ id: "a", title: "Eka" }, { id: "b", title: "Toka" }];
const row = (plan_id, id, kind, data, parent_id = "s") => ({ plan_id, id, kind, parent_id, data });
const items = [
  row("a", "w1", "stream", { label: "Myynti" }), row("a", "w2", "stream", { label: "Tekno" }), row("a", "p1", "phase", { title: "Selvitä" }),
  row("a", "r1", "role", { title: "CEO", owner: "Mika", stream: "w1" }), row("a", "r2", "role", { title: "CTO", owner: "Pontus", stream: "w2" }), row("a", "r3", "role", { title: "Toinen", owner: "Harri", stream: "w1" }),
  row("a", "t1", "task", { title: "Peritty Mikalle", stream: "w1", phase: "p1", status: "doing", due: "2026-01-05" }),
  row("a", "t2", "task", { title: "Käsin Iidalle", stream: "w1", owner: " Iida ", status: "done" }),
  row("a", "t3", "task", { title: "Teknologian asia", stream: "w2", status: "outo", due: "huomenna" }),
  row("a", "t4", "task", { title: "Ilman työvirtaa" }),
  row("b", "t5", "task", { title: "Toisen suunnitelman tehtävä", owner: "Mika" })
];
const rows = taskRows(items, plans);
const ids = (l) => l.map((r) => r.id);

test("rivit: vastuu on oma tai ensimmäisen saman työvirran vastuualueen omistaja, ja puuttuvat tiedot normalisoidaan", () => {
  assert.deepEqual(ids(rows), ["t1", "t2", "t3", "t4", "t5"], "suunnitelmien järjestyksessä");
  const t1 = rows[0];
  assert.deepEqual([t1.owner, t1.effective, t1.via, t1.streamLabel, t1.phaseLabel, t1.planTitle, t1.key], ["", "Mika", "CEO", "Myynti", "Selvitä", "Eka", "a/t1"], "peritty: ensimmäinen rooli voittaa");
  assert.deepEqual([rows[1].owner, rows[1].effective, rows[1].inherited, rows[1].via], ["Iida", "Iida", "Mika", "CEO"], "oma vastuu, ja vastuualueen oma omistaja näkyy erikseen");
  assert.deepEqual([rows[3].inherited, rows[3].via], ["", ""], "ei työvirtaa, ei vastuualuetta");
  assert.deepEqual([rows[2].status, rows[2].due], ["todo", ""], "tuntematon tila ja virheellinen päivä");
  assert.deepEqual([rows[3].effective, rows[3].streamLabel], ["", ""], "ei työvirtaa eikä vastuuta");
  assert.equal(rows[4].planTitle, "Toka");
  assert.ok(STATUS_LABEL.done);
});

test("suodatus: haku, suunnitelma, työvirta, vastuu, tila ja päivä", () => {
  const f = (x) => ids(filterRows(rows, x, "2026-02-01"));
  assert.deepEqual(f({}), ["t1", "t2", "t3", "t4", "t5"]);
  assert.deepEqual(f({ q: "  MIKALLE " }), ["t1"]);
  assert.deepEqual(f({ plan: "b" }), ["t5"]);
  assert.deepEqual(f({ stream: "w1" }), ["t1", "t2"]);
  assert.deepEqual(f({ owner: "mika" }), ["t1", "t5"], "kirjainkoolla ei ole väliä, peritty lasketaan mukaan");
  assert.deepEqual(f({ owner: "__none" }), ["t4"], "ei lainkaan vastuuta (t3 perii Pontuksen)");
  assert.deepEqual(f({ owner: "Pontus" }), ["t3"]);
  assert.deepEqual(f({ status: "done" }), ["t2"]);
  assert.deepEqual(f({ due: "none" }), ["t2", "t3", "t4", "t5"]);
  assert.deepEqual(f({ due: "late" }), ["t1"], "päivä ohi eikä valmis");
  assert.deepEqual(f({ phase: "p1", status: "doing", stream: "w1" }), ["t1"], "suodattimet yhdessä");
  assert.deepEqual(ids(filterRows(rows, { due: "late" }, "")), [], "ilman päivää ei myöhässä-suodatusta");
  assert.deepEqual(ownersIn(rows), ["Iida", "Mika", "Pontus"]);
});

test("massamuutos: vain muuttuvat kentät ja vain muuttuville riville", () => {
  const sel = rows.filter((r) => ["t1", "t2", "t5"].includes(r.id));
  const r = bulkPatches(sel, { owner: "Mika" });
  assert.deepEqual(r.patches, [{ planId: "a", id: "t1", data: { owner: "Mika" } }, { planId: "a", id: "t2", data: { owner: "Mika" } }], "t5:llä on jo Mika käsin");
  assert.deepEqual(bulkPatches(sel, { owner: "Mika", status: "done" }).patches.find((p) => p.id === "t2").data, { owner: "Mika" }, "t2 on jo valmis");
  assert.deepEqual(bulkPatches(sel, { due: "2026-03-01" }).patches.map((p) => p.planId + "/" + p.id), ["a/t1", "a/t2", "b/t5"], "myös toisen suunnitelman tehtävä");
  assert.deepEqual(bulkPatches(sel, { owner: "" }).patches, [{ planId: "a", id: "t2", data: { owner: "" } }, { planId: "b", id: "t5", data: { owner: "" } }], "tyhjä palauttaa vastuun vastuualueen mukaiseksi, t1:llä sitä ei ole asetettu");
  assert.deepEqual(bulkPatches(sel, { due: "" }).patches.map((p) => p.id), ["t1"], "päivän tyhjennys vain, jos päivä on");
  assert.deepEqual(bulkPatches(sel, { owner: "  Uusi   Nimi " }).patches[0].data, { owner: "Uusi Nimi" }, "välilyönnit siistitään");
  assert.deepEqual(bulkPatches(sel, { owner: "Mika" }).error, undefined);
  assert.deepEqual(bulkPatches([], { owner: "Mika" }).patches, []);
});

test("massamuutoksen virheelliset arvot hylätään kokonaan", () => {
  const sel = rows.slice(0, 2);
  for (const [c, why] of [[{}, "tyhjä"], [{ owner: 5 }, "owner ei teksti"], [{ owner: "x".repeat(61) }, "liian pitkä"], [{ due: "huomenna" }, "päivä"], [{ due: 5 }, "päivä ei teksti"], [{ status: "valmis" }, "tila"], [{ status: "" }, "tyhjä tila"]]) {
    const r = bulkPatches(sel, c);
    assert.ok(r.error && !r.patches, why + " " + JSON.stringify(c));
  }
  assert.ok(bulkPatches(sel, { due: "2026-12-31" }).patches);
});

test("peruutus palauttaa muutetut kentät riveiltä sellaisina kuin ne olivat", () => {
  const sel = rows.filter((r) => ["t1", "t2"].includes(r.id));
  const r = bulkPatches(sel, { owner: "Pontus", status: "todo", due: "2026-09-09" });
  const back = invertPatches(sel, r.patches);
  assert.deepEqual(back, [{ planId: "a", id: "t1", data: { owner: "", status: "doing", due: "2026-01-05" } }, { planId: "a", id: "t2", data: { owner: "Iida", status: "done", due: "" } }]);
  assert.deepEqual(invertPatches([], [{ planId: "a", id: "x", data: { owner: "A" } }]), [{ planId: "a", id: "x", data: { owner: "" } }]);
});

test("suodatin hyväksyy useita arvoja yhtä aikaa", () => {
  const rows = taskRows(items, plans);
  const one = filterRows(rows, { stream: "w1" }).length, two = filterRows(rows, { stream: ["w1", "w2"] }).length;
  assert.ok(two > one);
  assert.equal(filterRows(rows, { stream: [] }).length, rows.length, "tyhjä lista = kaikki");
  assert.equal(filterRows(rows, { stream: ["w1"], status: ["done", "doing"] }).length, filterRows(rows, { stream: "w1" }).filter((r) => r.status !== "todo").length);
});

test("ryhmittely: tila luonnollisessa järjestyksessä, tyhjä arvo viimeisenä", () => {
  const rows = taskRows(items, plans);
  const byStatus = groupRows(rows, "status");
  assert.deepEqual(byStatus.map((g) => g.key), ["todo", "doing", "done"].filter((k) => rows.some((r) => r.status === k)));
  const byMonth = groupRows(rows, "month");
  assert.equal(byMonth.reduce((n, g) => n + g.rows.length, 0), rows.length);
  assert.equal(byMonth[byMonth.length - 1].label, "Ei määräpäivää");
  assert.equal(groupRows(rows, "").length, 1);
  assert.equal(groupRows(rows, "month")[0].label, "Tammikuu 2026");
});

test("jaksot: kuukauden ja neljänneksen viimeinen päivä", () => {
  assert.equal(lastDay(2026, 11), 30);
  assert.equal(lastDay(2028, 2), 29);
  const p = periodOptions("2026-11-04");
  assert.ok(p.months.some((m) => m.value === "2026-11-30" && m.label === "Marraskuu 2026 (30.11.)"));
  assert.ok(p.months.some((m) => m.value === "2027-02-28"));
  assert.equal(p.quarters[0].value, "2026-12-31");
  assert.equal(p.quarters[0].label, "Q4 2026 (31.12.)");
  assert.equal(p.quarters[1].value, "2027-03-31");
});
