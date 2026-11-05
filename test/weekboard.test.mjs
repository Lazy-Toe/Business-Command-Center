import test from "node:test";
import assert from "node:assert/strict";
import { weekColumns, columnOf, dueForColumn, weekBoard } from "../public/app/core/weekboard.js";

const T = "2026-11-05"; // torstai, viikko 45
const task = (id, due, owner, stream) => ({ plan_id: "a", id, owner, stream: stream && { data: { label: stream, color: "kate" } }, data: due ? { due } : {} });

test("sarakkeet: myöhässä, viisi viikkoa tästä alkaen, myöhemmin ja ei päivää", () => {
  const c = weekColumns(T, 5);
  assert.deepEqual(c.map((x) => x.id), ["late", "w:2026-11-08", "w:2026-11-15", "w:2026-11-22", "w:2026-11-29", "w:2026-12-06", "later", "none"]);
  assert.deepEqual(c.slice(1, 4).map((x) => x.data.title), ["Tämä viikko", "Ensi viikko", "Viikko 47"]);
  assert.equal(c[1].data.label, "VKO 45 · 2.–8.11.");
});

test("tehtävä sarakkeeseen: menneet myöhässä, tämän viikon päivät tälle viikolle, kaukaiset myöhemmin, ilman päivää omaan", () => {
  const c = weekColumns(T, 5), at = (due) => columnOf(task("x", due), T, c);
  assert.equal(at("2026-11-04"), "late");
  assert.equal(at("2026-11-05"), "w:2026-11-08", "tänään on tämä viikko");
  assert.equal(at("2026-11-08"), "w:2026-11-08", "viikon sunnuntai");
  assert.equal(at("2026-11-09"), "w:2026-11-15");
  assert.equal(at("2026-12-06"), "w:2026-12-06");
  assert.equal(at("2026-12-07"), "later");
  assert.equal(at(""), "none");
});

test("raahauksen kohde: viikko antaa sunnuntain, ei päivää tyhjentää, myöhässä ja myöhemmin eivät ole kohteita", () => {
  assert.equal(dueForColumn("w:2026-11-15"), "2026-11-15");
  assert.equal(dueForColumn("none"), "");
  assert.equal(dueForColumn("late"), null);
  assert.equal(dueForColumn("later"), null);
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
