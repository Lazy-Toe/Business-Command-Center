import test from "node:test";
import assert from "node:assert/strict";
import { weekColumns, columnOf, dueForColumn, weekBoard } from "../public/app/core/weekboard.js";

const T = "2026-11-05"; // torstai, viikko 45
const task = (id, due, owner, stream) => ({ plan_id: "a", id, owner, stream: stream && { data: { label: stream, color: "kate" } }, data: due ? { due } : {} });

test("sarakkeet tehtävien mukaan: viikot 0-2 aina, muut viikot vain jos tehtäviä, kaukaiset kuukausittain, Ei päivää viimeisenä", () => {
  const ids = (tasks) => weekColumns(T, tasks).map((x) => x.id);
  assert.deepEqual(ids([]), ["w:2026-11-08", "w:2026-11-15", "w:2026-11-22", "none"], "ei tehtäviä: vain kolme viikkoa ja Ei päivää, eikä Myöhässä");
  assert.deepEqual(ids([task("a", "2026-11-01")]), ["late", "w:2026-11-08", "w:2026-11-15", "w:2026-11-22", "none"]);
  assert.deepEqual(ids([task("a", "2026-12-02")]), ["w:2026-11-08", "w:2026-11-15", "w:2026-11-22", "w:2026-12-06", "none"], "viikko 49 mukaan, koska siinä on tehtävä");
  assert.deepEqual(ids([task("a", "2027-01-31"), task("b", "2027-01-05"), task("c", "2027-03-02")]), ["w:2026-11-08", "w:2026-11-15", "w:2026-11-22", "m:2027-01", "m:2027-03", "none"]);
  const c = weekColumns(T, []);
  assert.deepEqual(c.slice(0, 3).map((x) => x.data.title), ["Tämä viikko", "Ensi viikko", "Viikko 47"]);
  assert.equal(c[0].data.label, "VKO 45 · 2.–8.11.");
  assert.equal(weekColumns(T, [task("a", "2027-01-31")]).find((x) => x.id === "m:2027-01").data.title, "Tammikuu 2027");
});

test("tehtävä sarakkeeseen: menneet myöhässä, viikon päivät viikolle, kaukaiset kuukaudelle, ilman päivää omaan", () => {
  const tasks = [task("x", "2027-01-31")], c = weekColumns(T, tasks), at = (due) => columnOf(task("x", due), T, c);
  assert.equal(at("2026-11-04"), "late");
  assert.equal(at("2026-11-05"), "w:2026-11-08", "tänään on tämä viikko");
  assert.equal(at("2026-11-08"), "w:2026-11-08", "viikon sunnuntai");
  assert.equal(at("2026-11-09"), "w:2026-11-15");
  assert.equal(at("2027-01-31"), "m:2027-01");
  assert.equal(at(""), "none");
});

test("raahauksen kohde: viikko antaa sunnuntain, kuukausi viimeisen päivän, ei päivää tyhjentää, myöhässä ei ole kohde", () => {
  assert.equal(dueForColumn("w:2026-11-15"), "2026-11-15");
  assert.equal(dueForColumn("m:2027-02"), "2027-02-28");
  assert.equal(dueForColumn("m:2028-02"), "2028-02-29");
  assert.equal(dueForColumn("none"), "");
  assert.equal(dueForColumn("late"), null);
});

test("rivit henkilöittäin tai työvirroittain, ilman henkilöä ensimmäisenä", () => {
  const tasks = [task("1", "2026-11-06", "Mika", "Myynti"), task("2", "2026-11-12", "Iida", "Tekno"), task("3", "", "", "Myynti"), task("4", "2026-11-06", "Mika", "")];
  const byOwner = weekBoard(tasks, T, "owner");
  assert.deepEqual(byOwner.streams.map((l) => l.data.label), ["Ei vastuuhenkilöä", "Iida", "Mika"]);
  assert.deepEqual(byOwner.tasks.map((t) => [t.id, t.data.phase, t.data.stream]), [["1", "w:2026-11-08", "Mika"], ["2", "w:2026-11-15", "Iida"], ["3", "none", ""], ["4", "w:2026-11-08", "Mika"]]);
  const byStream = weekBoard(tasks, T, "stream");
  assert.deepEqual(byStream.streams.map((l) => l.data.label), ["Ei työvirtaa", "Myynti", "Tekno"]);
  assert.equal(byStream.streams[1].data.color, "kate");
  assert.equal(weekBoard([], T).tasks.length, 0);
});

test("aikajana: viikot, palkit aloituksesta lopetukseen, ilman aloitusta lopetusviikolla, ilman päiviä erilleen", async () => {
  const { timelineModel } = await import("../public/app/core/weekboard.js");
  const tk = (id, start, due, owner) => ({ plan_id: "a", id, owner, stream: null, data: Object.assign({}, start ? { start } : {}, due ? { due } : {}) });
  const m = timelineModel([tk("1", "2026-11-09", "2026-11-22", "Mika"), tk("2", "", "2026-11-05", "Mika"), tk("3", "", "", "Mika"), tk("4", "2026-10-01", "2026-12-24", "Iida"), tk("5", "2026-11-10", "", "Iida")], T);
  assert.equal(m.weeks[0].start, "2026-10-05", "korkeintaan neljä viikkoa taaksepäin");
  assert.equal(m.weeks.find((w) => w.now).start, "2026-11-02");
  assert.ok(m.weeks.length >= 8 && m.weeks.at(-1).end >= "2026-12-27", "ulottuu viimeiseen lopetukseen asti");
  const idx = (iso) => m.weeks.findIndex((w) => w.start <= iso && iso <= w.end);
  const mika = m.lanes.find((l) => l.id === "Mika").rows, by = (id) => mika.find((r) => r.task.id === id);
  assert.deepEqual([by("1").from, by("1").to], [idx("2026-11-09"), idx("2026-11-22")], "palkki aloitusviikosta lopetusviikkoon");
  assert.deepEqual([by("2").from, by("2").to], [idx("2026-11-05"), idx("2026-11-05")], "ilman aloitusta yhden viikon palkki lopetukseen");
  assert.equal(by("2").late, false);
  assert.deepEqual(m.undated.map((t) => t.id), ["3"]);
  const iida = m.lanes.find((l) => l.id === "Iida").rows;
  assert.equal(iida.find((r) => r.task.id === "4").from, 0);
  assert.equal(iida.find((r) => r.task.id === "4").clipL, true, "alkaa ennen näkyvää aluetta");
  assert.deepEqual([iida.find((r) => r.task.id === "5").from, iida.find((r) => r.task.id === "5").to], [idx("2026-11-10"), idx("2026-11-10")], "ilman lopetusta aloitusviikolle");
  assert.equal(m.months.reduce((n, x) => n + x.span, 0), m.weeks.length);
  assert.deepEqual(timelineModel([], T).lanes, []);
});
