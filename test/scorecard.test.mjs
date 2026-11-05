import test from "node:test";
import assert from "node:assert/strict";
import { toNumber, valuesOf, scoreRow, orderDefs, rowsFor, recipientsOf, freeRows, totals, periodPreset, periodText, virtualId } from "../public/app/core/scorecard.js";

const def = (id, data, parent_id = "g1", position = 1) => ({ id, kind: "metricdef", parent_id, position, data });
const D1 = def("d1", { name: "Liikevaihto", stream: "w1", target: "1500", min: "1400", max: "1800", weight: "20" });
const row = (id, data, parent_id = "r1") => ({ id, kind: "metric", parent_id, data });
const role = (data) => ({ id: "r1", plan_id: "p", data });

test("lukuarvo vapaasta tekstistä", () => {
  assert.equal(toNumber("1 520"), 1520);
  assert.equal(toNumber("12,5"), 12.5);
  assert.equal(toNumber("92 %"), 92);
  assert.equal(toNumber(" -3 "), -3);
  for (const bad of ["", null, undefined, "3x", "abc", "1.2.3"]) assert.equal(toNumber(bad), null, String(bad));
});

test("tulos ja painotettu tulos: 1520 / 1500 on 1,013 ja painotettuna 20 %:lla 0,203 (esimerkissä 0,202, koska tulos on siinä pyöristetty 1,01:een)", () => {
  const s = scoreRow(D1, row("x", { def: "d1", actual: "1520" }));
  assert.ok(Math.abs(s.result - 1.01333) < 1e-4);
  assert.equal(String(s.weighted.toFixed(3)), "0.203");
  assert.equal(scoreRow(D1, row("x", { def: "d1", actual: "1350" })).below, true, "alle alarajan");
  assert.equal(scoreRow(D1, row("x", { def: "d1", actual: "1400" })).below, false, "raja itse ei ole alle");
  const none = scoreRow(D1, row("x", { def: "d1" }));
  assert.deepEqual([none.result, none.weighted, none.below], [null, null, false], "ilman toteumaa ei tulosta eikä varoitusta");
  assert.equal(scoreRow(def("d", { target: "100", weight: "40", formula: "ACTUAL / TARGET" }), row("x", { actual: "70" })).weighted.toFixed(2), "0.28");
});

test("virheellinen kaava näkyy virheenä eikä kaada", () => {
  const s = scoreRow(def("d", { target: "1", formula: "FOO + 1" }), row("x", { actual: "1" }));
  assert.equal(s.result, null);
  assert.ok(s.error.includes("Tuntematon nimi"));
});

test("lukittu kenttä tulee mallilta, lukitsematon voi saada oman arvon", () => {
  const d = def("d", { target: "100", min: "80", weight: "10", lock: { target: true } });
  const v = valuesOf(d, row("x", { target: "999", min: "70", weight: "", actual: "5" }));
  assert.deepEqual([v.target, v.min, v.weight, v.actual], ["100", "70", "10", "5"]);
});

test("mallit järjestetään tavoitteen ja paikan mukaan, tavoitteeton viimeisenä", () => {
  const goals = [{ id: "g2", position: 2 }, { id: "g1", position: 1 }];
  const defs = [def("c", {}, "g2", 1), def("b", {}, "g1", 2), def("a", {}, "g1", 1), def("orpo", {}, "ei", 1)];
  assert.deepEqual(orderDefs(goals, defs).map((d) => d.id), ["a", "b", "c", "orpo"]);
});

test("automaattinen jako: saman työvirran mallit tulevat itsestään, muut vain lisättyinä, piilotettu ei lainkaan", () => {
  const defs = [D1, def("d2", { name: "Kontaktit", stream: "w1" }, "g1", 2), def("d3", { name: "Kulut", stream: "w2" }, "g1", 3), def("d4", { name: "Ilman ryhmää" }, "g1", 4)];
  const r = role({ stream: "w1" });
  let list = rowsFor(r, defs, []);
  assert.deepEqual(list.map((x) => x.def.id), ["d1", "d2"]);
  assert.ok(list.every((x) => x.virtual && x.auto));
  assert.equal(list[0].row.id, virtualId("r1", "d1"));
  assert.equal(list[0].row.parent_id, "r1");

  list = rowsFor(r, defs, [row("m9", { def: "d3", actual: "5" }), row("m1", { def: "d1", actual: "1520" })]);
  assert.deepEqual(list.map((x) => [x.def.id, x.virtual, x.auto]), [["d1", false, true], ["d2", true, true], ["d3", false, false]], "lisätty (d3) ja tallennettu (d1)");
  assert.equal(list[0].row.id, "m1");
  assert.ok(list[0].score.result != null);

  list = rowsFor(role({ stream: "w1", hide: ["d2", "d3"] }), defs, [row("m9", { def: "d3" })]);
  assert.deepEqual(list.map((x) => x.def.id), ["d1"]);
  assert.deepEqual(rowsFor(role({}), defs, []).map((x) => x.def.id), [], "työvirrattomalla roolilla ei automaattisia");
});

test("vapaat mittarit ilman mallia ja yhteensä", () => {
  assert.deepEqual(freeRows([row("a", { name: "Vanha" }), row("b", { def: "d1" })]).map((r) => r.id), ["a"]);
  const list = [
    { score: { weighted: 0.2, weight: "20" } }, { score: { weighted: 0.18, weight: "20" } }, { score: { weighted: null, weight: "60" } }
  ];
  const t = totals(list);
  assert.deepEqual([t.weight, Number(t.weighted.toFixed(2)), t.count], [100, 0.38, 2], "painot kaikilta riveiltä, lopputulos vain tuloksellisilta");
  assert.deepEqual(totals([]), { weight: 0, weighted: 0, count: 0 });
  assert.equal(totals([{ score: { weighted: null, weight: null } }]).weight, 0, "paino puuttuu");
});

test("valmiit jaksot ja jakson teksti", () => {
  assert.deepEqual(periodPreset("year", 2026), { start: "2026-01-01", end: "2026-12-31" });
  assert.deepEqual(periodPreset("h2", 2026), { start: "2026-07-01", end: "2026-12-31" });
  assert.deepEqual(periodPreset("Q1", 2021), { start: "2021-01-01", end: "2021-03-31" });
  assert.deepEqual(periodPreset("q2", 2024), { start: "2024-04-01", end: "2024-06-30" });
  assert.deepEqual(periodPreset("m2", 2024), { start: "2024-02-01", end: "2024-02-29" }, "karkausvuosi");
  assert.deepEqual(periodPreset("m2", 2026), { start: "2026-02-01", end: "2026-02-28" });
  for (const bad of [["q5", 2026], ["x", 2026], ["year", "abc"], ["year", 1800]]) assert.equal(periodPreset(...bad), null, JSON.stringify(bad));
  assert.equal(periodText("2026-01-01", "2026-03-31"), "1.1.2026–31.3.2026");
  assert.equal(periodText("", ""), "");
  assert.equal(periodText("2026-05-04", ""), "4.5.2026");
});

test("malli suoraan roolille: roles-kenttä toimii työvirrasta riippumatta", () => {
  const direct = def("d7", { name: "Suora", stream: "", roles: ["r1"] });
  const r = role({ stream: "w9" });
  const list = rowsFor(r, [direct], []);
  assert.deepEqual(list.map((x) => x.def.id), ["d7"]);
  assert.equal(list[0].auto, true);
  assert.deepEqual(rowsFor({ id: "r2", plan_id: "p", data: { stream: "w9" } }, [direct], []), [], "toinen rooli ei saa");
  assert.deepEqual(rowsFor(role({ stream: "w9", hide: ["d7"] }), [direct], []), [], "piilotus voittaa");
});

test("recipientsOf kertoo kenelle malli tulee ja miksi", () => {
  const d = def("d8", { stream: "w1", roles: ["r2"] });
  const roles = [{ id: "r1", data: { stream: "w1" } }, { id: "r2", data: {} }, { id: "r3", data: {} }, { id: "r4", data: { stream: "w1", hide: ["d8"] } }];
  const to = recipientsOf(d, roles, [{ parent_id: "r3", data: { def: "d8" } }]);
  assert.deepEqual(to.map((x) => [x.role.id, x.via]), [["r1", "stream"], ["r2", "role"], ["r3", "manual"]]);
});

test("vastuualueella voi olla useita työvirtoja, vanha yksi työvirta toimii", async () => {
  const { roleStreams, hasStream, streamsPatch, assignedTo } = await import("../public/app/core/scorecard.js");
  const uusi = { id: "r", data: { streams: ["a", "b"], stream: "a" } }, vanha = { id: "v", data: { stream: "a" } }, tyhja = { id: "t", data: { streams: [], stream: "" } };
  assert.deepEqual(roleStreams(uusi), ["a", "b"]);
  assert.deepEqual(roleStreams(vanha), ["a"]);
  assert.deepEqual(roleStreams(tyhja), []);
  assert.deepEqual(roleStreams({ data: {} }), []);
  assert.ok(hasStream(uusi, "b") && !hasStream(uusi, "c") && !hasStream(uusi, ""));
  assert.deepEqual(streamsPatch(["b", "a"]), { streams: ["b", "a"], stream: "b" });
  assert.deepEqual(streamsPatch([]), { streams: [], stream: "" });
  assert.ok(assignedTo({ data: { stream: "b" } }, uusi));
  assert.ok(!assignedTo({ data: { stream: "b" } }, vanha));
  assert.ok(!assignedTo({ data: { stream: "" } }, tyhja), "tyhjä työvirta ei täsmää");
});
