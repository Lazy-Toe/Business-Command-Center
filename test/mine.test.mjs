import test from "node:test";
import assert from "node:assert/strict";
import { buildMine } from "../public/app/core/mine.js";

const T = "2026-11-04";
const task = (id, data, plan = "a") => ({ plan_id: plan, id, kind: "task", parent_id: "s", data: { status: "todo", ...data } });
const items = [
  { plan_id: "a", id: "w1", kind: "stream", data: { label: "Myynti", color: "kate" } },
  { plan_id: "a", id: "r1", kind: "role", position: 2, data: { title: "Sales", owner: "Mika", stream: "w1" } },
  { plan_id: "a", id: "r2", kind: "role", position: 1, data: { title: "Tekno", owner: "Iida" } },
  { plan_id: "b", id: "r3", kind: "role", position: 1, data: { title: "Kanava", owner: " mika " } },
  { plan_id: "a", id: "d1", kind: "metricdef", parent_id: "g", position: 1, data: { name: "Oma tavoite", stream: "w1", target: "10", min: "8", weight: "50" } },
  { plan_id: "a", id: "d2", kind: "metricdef", parent_id: "g", position: 2, data: { name: "Toinen tavoite", stream: "w1", target: "10", min: "8" } },
  { plan_id: "a", id: "m2", kind: "metric", parent_id: "r1", position: 2, data: { def: "d2", actual: "5" } },
  { plan_id: "a", id: "m1", kind: "metric", parent_id: "r1", position: 1, data: { name: "Vanha vapaa mittari" } },
  { plan_id: "a", id: "mx", kind: "metric", parent_id: "r2", position: 1, data: { name: "Ei minun" } },
  task("peritty", { due: "2026-11-03", stream: "w1" }),
  task("oma", { due: T, owner: "MIKA" }),
  task("muu", { due: T, owner: "Iida" }),
  task("ilman", {}, "b"),
  task("valmis", { due: T, owner: "Mika", status: "done" })
];
const ids = (l) => l.map((x) => x.id);

test("omat tehtävät: vain valittu vastuuhenkilö, työvirta ei siirrä, kirjainkoolla ei ole väliä, valmis ei näy", () => {
  const r = buildMine(items, "Mika", T);
  assert.deepEqual(ids(r.late), [], "peritty-tehtävällä ei ole vastuuhenkilöä, joten se ei ole kenenkään");
  assert.deepEqual(ids(r.today), ["oma"]);
  assert.equal(r.open, 1);
});

test("omat scorecardit: kaikkien suunnitelmien omat vastuualueet mittareineen järjestyksessä", () => {
  const r = buildMine(items, "mika", T);
  assert.deepEqual(r.scorecards.map((s) => [s.plan_id, s.role.id]), [["a", "r1"], ["b", "r3"]]);
  assert.deepEqual(r.scorecards[0].rows.map((x) => [x.def.id, x.virtual]), [["d1", true], ["d2", false]], "työvirran mallit tulevat itsestään, d1 vielä tallentamatta");
  assert.deepEqual(ids(r.scorecards[0].free), ["m1"], "vanha mittari ilman mallia säilyy");
  assert.deepEqual(r.scorecards[1].rows, [], "toinen rooli ilman työvirtaa ei saa mallirivejä");
});

test("huomiota vaativat ja alle rajan olevat mittarit rajautuvat omiin vastuualueisiin", () => {
  assert.deepEqual(ids(buildMine(items, "Mika", T).attention), ["m2"], "toteuma 5 on alle alarajan 8");
  assert.equal(buildMine(items, "Mika", T).below, 1);
  assert.deepEqual(ids(buildMine(items, "Iida", T).attention), []);
});

test("ilman henkilöä ei näytetä mitään", () => {
  const r = buildMine(items, "", T);
  assert.equal(r.open, 0);
  assert.deepEqual(r.scorecards, []);
});

test("henkilö arvataan sähköpostista vain yksiselitteisesti", async () => {
  const { guessPerson } = await import("../public/app/core/mine.js");
  const names = ["Harri", "Iida", "Mika", "Pontus"];
  assert.equal(guessPerson("makela.mika@gmail.com", names), "Mika");
  assert.equal(guessPerson("harri@yritys.fi", names), "Harri");
  assert.equal(guessPerson("mika.harri@yritys.fi", names), "", "kaksi osumaa");
  assert.equal(guessPerson("mikael@yritys.fi", names), "", "osa sanasta ei riitä");
  assert.equal(guessPerson("makela.mika@x.fi", ["Mika Mäkelä"]), "Mika Mäkelä");
  assert.equal(guessPerson("", names), "");
});
