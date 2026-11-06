import test from "node:test";
import assert from "node:assert/strict";
import { mineParts, visibleTasks, visibleStreams } from "../public/app/core/myboard.js";

const r = (plan_id, id, kind, data, position = 1, parent_id = "s") => ({ plan_id, id, kind, parent_id, position, data });
const items = [
  r("a", "p1", "phase", { label: "PÄIVÄT 1-30", title: "Kuuntele" }, 1), r("a", "p2", "phase", { label: "PÄIVÄT 31-60", title: "Päätä" }, 2),
  r("a", "w1", "stream", { label: "Myynti", color: "kate" }, 1), r("a", "w2", "stream", { label: "Tekno", color: "tekno" }, 2),
  r("a", "t1", "task", { title: "A", phase: "p2", stream: "w1", owner: "Mika", status: "todo", due: "2026-12-01" }, 1),
  r("a", "t2", "task", { title: "B", phase: "p2", stream: "w1", owner: "mika", status: "doing" }, 2),
  r("a", "t3", "task", { title: "C", phase: "p1", stream: "w1", owner: "Mika", status: "done" }, 3),
  r("a", "t4", "task", { title: "D", phase: "p1", stream: "w2", owner: "Iida", status: "todo" }, 4),
  r("a", "t5", "task", { title: "Ei vastuuta", phase: "p1", stream: "w2", status: "todo" }, 5),
  r("a", "t6", "task", { title: "Poistettu vaihe", phase: "px", stream: "wx", owner: "Mika", status: "todo" }, 6),
  r("b", "t7", "task", { title: "Toinen suunnitelma", owner: "Mika", status: "todo" })
];

test("omat tehtävät taulun tiedoiksi: vain omat (vastuuta ei peritä), valmiit mukana, vain luku", () => {
  const [a] = mineParts(items, "Mika", ["a", "b"]);
  assert.equal(a.plan_id, "a");
  assert.deepEqual(a.tasks.map((t) => t.id), ["t1", "t2", "t3", "t6"], "ei Iidan eikä vastuuttoman tehtävää, valmis mukana");
  assert.deepEqual([a.readonly, a.hideEmptyLanes], [true, true]);
  assert.deepEqual(a.phases.map((p) => p.id), ["p1", "p2"]);
  assert.deepEqual(a.streams.map((w) => w.id), ["w1", "w2", ""], "viimeisenä virtuaalinen rivi Ei työvirtaa, johon voi lisätä tehtävän");
});

test("poistunut vaihe ja työvirta korvautuvat ensimmäisellä kuten suunnitelman taulussa", () => {
  const [a] = mineParts(items, "Mika", ["a"]);
  const t6 = a.tasks.find((t) => t.id === "t6");
  assert.deepEqual([t6.data.phase, t6.data.stream], ["p1", "w1"]);
});

test("rajaus: valmiit piiloon ja vain työvirrat, joissa on näytettävää", () => {
  const [a] = mineParts(items, "Mika", ["a"]);
  assert.deepEqual(visibleTasks(a.tasks, true).map((t) => t.id), ["t1", "t2", "t6"]);
  assert.equal(visibleTasks(a.tasks, false).length, 4);
  assert.deepEqual(visibleStreams(a.streams, visibleTasks(a.tasks, true), true).map((w) => w.id), ["w1", ""], "Tekno ei näy: Mikalla ei ole siinä tehtäviä, mutta Ei työvirtaa -rivi näkyy aina");
  assert.equal(visibleStreams(a.streams, [], false).length, 3, "ilman rajausta kaikki");
});

test("suunnitelmat järjestyksessä, ilman vaiheita ja työvirtoja tehtävät silti näkyvät, ilman henkilöä ei tauluja", () => {
  const boards = mineParts(items, "Mika", ["b", "a"]);
  assert.deepEqual(boards.map((b) => b.plan_id), ["b", "a"]);
  const b = boards[0];
  assert.deepEqual([b.phases.length, b.streams.length, b.tasks.length], [1, 1, 1]);
  assert.deepEqual(mineParts(items, "", ["a"]), []);
  assert.deepEqual(mineParts(items, "Pontus", ["a"]), []);
});

test("tehtävä ilman työvirtaa pysyy ilman työvirtaa, poistettu työvirta korvautuu ensimmäisellä", async () => {
  const { laneOf, NONE_STREAM } = await import("../public/app/core/myboard.js");
  const streams = [{ id: "w1" }, { id: "w2" }];
  assert.equal(laneOf("", streams), "");
  assert.equal(laneOf(undefined, streams), "");
  assert.equal(laneOf("w2", streams), "w2");
  assert.equal(laneOf("poistettu", streams), "w1");
  assert.equal(laneOf("poistettu", []), "");
  assert.ok(NONE_STREAM.virtual && NONE_STREAM.id === "");
});
