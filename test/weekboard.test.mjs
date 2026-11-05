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
