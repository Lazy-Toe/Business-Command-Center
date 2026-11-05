import test from "node:test";
import assert from "node:assert/strict";
import { buildBoards } from "../public/app/core/myboard.js";

const r = (plan_id, id, kind, data, position = 1, parent_id = "s") => ({ plan_id, id, kind, parent_id, position, data });
const items = [
  r("a", "p1", "phase", { label: "PÄIVÄT 1-30", title: "Kuuntele" }, 1), r("a", "p2", "phase", { label: "PÄIVÄT 31-60", title: "Päätä" }, 2),
  r("a", "w1", "stream", { label: "Myynti", color: "kate" }, 1), r("a", "w2", "stream", { label: "Tekno", color: "tekno" }, 2),
  r("a", "t1", "task", { title: "A", phase: "p2", stream: "w1", owner: "Mika", status: "todo", due: "2026-12-01" }),
  r("a", "t2", "task", { title: "B", phase: "p2", stream: "w1", owner: "mika", status: "doing", due: "2026-11-05" }),
  r("a", "t3", "task", { title: "C", phase: "p1", stream: "w1", owner: "Mika", status: "done" }),
  r("a", "t4", "task", { title: "D", phase: "p1", stream: "w2", owner: "Iida", status: "todo" }),
  r("a", "t5", "task", { title: "Ei vastuuta", phase: "p1", stream: "w2", status: "todo" }),
  r("a", "t6", "task", { title: "Poistettu vaihe", phase: "px", stream: "wx", owner: "Mika", status: "todo" }),
  r("b", "t7", "task", { title: "Toinen suunnitelma", owner: "Mika", status: "todo" })
];

test("omat tehtävät omaan tauluun: vain omat, valmiit lasketaan eikä näytetä, vastuuta ei peritä", () => {
  const [a] = buildBoards(items, "Mika", ["a", "b"]);
  assert.equal(a.plan_id, "a");
  assert.equal(a.open, 3, "t1, t2 ja t6; t3 on valmis");
  assert.equal(a.done, 1);
  const all = a.lanes.flatMap((l) => Object.values(l.cells).flat()).map((t) => t.id).sort();
  assert.deepEqual(all, ["t1", "t2", "t6"], "ei Iidan eikä vastuuttoman tehtävää");
});

test("rivit vain työvirroille, joissa on avoimia tehtäviä, ja solu on määräpäivän mukaan", () => {
  const [a] = buildBoards(items, "Mika", ["a"]);
  assert.deepEqual(a.lanes.map((l) => l.id), ["w1"], "Tekno ei näy: Mikalla ei ole siinä avoimia");
  assert.deepEqual(a.lanes[0].cells.p2.map((t) => t.id), ["t2", "t1"], "aikaisin päivä ensin");
});

test("poistunut vaihe ja työvirta korvautuvat ensimmäisellä, ja korostus on ensimmäinen vaihe jossa on avoimia", () => {
  const [a] = buildBoards(items, "Mika", ["a"]);
  assert.ok(a.lanes[0].cells.p1.some((t) => t.id === "t6"), "t6 siirtyy ensimmäiseen vaiheeseen ja työvirtaan");
  assert.equal(a.focus, "p1");
  assert.deepEqual(a.phaseCounts, { p1: 1, p2: 2 });
});

test("suunnitelmat järjestyksessä, ilman vaiheita ja työvirtoja tehtävät silti näkyvät, ilman henkilöä ei tauluja", () => {
  const boards = buildBoards(items, "Mika", ["b", "a"]);
  assert.deepEqual(boards.map((b) => b.plan_id), ["b", "a"]);
  const b = boards[0];
  assert.deepEqual([b.phases.length, b.lanes.length, b.open], [1, 1, 1]);
  assert.deepEqual(buildBoards(items, "", ["a"]), []);
  assert.deepEqual(buildBoards(items, "Pontus", ["a"]), []);
});
