import test from "node:test";
import assert from "node:assert/strict";
import { canCreate, typesFor, dateFi, formLabel, visibleForms, draftRows, freezeRows, scoreSnapshot, scoreForm, checkForm } from "../public/app/core/forms.js";
import { rowsFor } from "../public/app/core/scorecard.js";

const type = (id, data, position = 1) => ({ id, kind: "formtype", position, data: Object.assign({ name: id }, data) });
const types = [type("kommentti", { memberCreate: true, memberView: true, table: false }, 1), type("ehdotus", { memberCreate: true, memberView: true, table: true, proposal: true }, 2),
  type("arviointi", { memberCreate: false, memberView: true, table: true, score: true }, 3), type("sisainen", { memberCreate: false, memberView: false, table: true }, 4)];
const def = (id, data, position = 1) => ({ id, kind: "metricdef", position, data: Object.assign({ name: "Malli " + id, stream: "w1", formula: "ACTUAL / TARGET" }, data) });
const D1 = def("d1", { name: "Liikevaihto", target: "1500", min: "1400", max: "1800", weight: "20", start: "2026-01-01", end: "2026-03-31", lock: { target: true } });
const D2 = def("d2", { name: "Kontaktit", target: "40", min: "30", weight: "10" }, 2);
const role = { id: "r1", plan_id: "p", data: { owner: "Mika", stream: "w1" } };
const effective = (rows = []) => rowsFor(role, [D1, D2], rows);
const form = (id, data, parent_id = "r1") => ({ id, kind: "form", parent_id, position: 1, data });

test("oikeus luoda tyyppi: ylläpitäjä kaikkea, jäsen vain sallittuja, ja järjestys paikan mukaan", () => {
  assert.equal(canCreate(types[2], true), true);
  assert.equal(canCreate(types[2], false), false);
  assert.equal(canCreate(types[0], false), true);
  assert.equal(canCreate(undefined, true), false);
  assert.deepEqual(typesFor(types, false).map((t) => t.id), ["kommentti", "ehdotus"]);
  assert.deepEqual(typesFor(types, true).map((t) => t.id), ["kommentti", "ehdotus", "arviointi", "sisainen"]);
});

test("päivä ja nimike", () => {
  assert.equal(dateFi("2020-04-20T10:11:12.000Z"), "20.4.2020");
  assert.equal(dateFi("rikki"), "");
  assert.equal(formLabel(form("f", { typeName: "Kommentti", at: "2019-11-19T08:00:00Z" })), "Kommentti 19.11.2019");
  assert.equal(formLabel(form("f", {})), "Lomake");
});

test("näkyvyys: ylläpitäjä näkee kaiken, jäsen vain sallitut tyypit ja omat, uusin ensin, vain tämän roolin", () => {
  const forms = [
    form("a", { type: "kommentti", at: "2026-01-01T00:00:00Z", byPerson: "Muu" }), form("b", { type: "sisainen", at: "2026-02-01T00:00:00Z", byPerson: "Muu" }),
    form("c", { type: "sisainen", at: "2026-03-01T00:00:00Z", byPerson: "Mika" }), form("d", { type: "arviointi", at: "2026-04-01T00:00:00Z", byPerson: "Johtaja" }),
    form("x", { type: "kommentti", at: "2026-05-01T00:00:00Z" }, "r2")
  ];
  assert.deepEqual(visibleForms(role, forms, types, { admin: true }).map((f) => f.id), ["d", "c", "b", "a"]);
  assert.deepEqual(visibleForms(role, forms, types, { admin: false, person: "Mika" }).map((f) => f.id), ["d", "c", "a"], "oma sisäinen näkyy, muiden ei");
  assert.deepEqual(visibleForms(role, forms, types, { admin: false, person: "" }).map((f) => f.id), ["d", "a"]);
  assert.deepEqual(visibleForms(role, forms, [], { admin: false, person: "Muu" }).map((f) => f.id), ["b", "a"], "tuntematon tyyppi näkyy vain tekijälle");
});

test("luonnos on kopio roolin riveistä ja jäädytys ottaa nimen ja kaavan mallista", () => {
  const d = draftRows(effective([{ id: "m1", kind: "metric", parent_id: "r1", data: { def: "d1", actual: "1520" } }]));
  assert.deepEqual(d[0], { def: "d1", target: "1500", min: "1400", max: "1800", weight: "20", actual: "1520" });
  assert.deepEqual(d[1], { def: "d2", target: "40", min: "30", max: "", weight: "10", actual: "" });
  const f = freezeRows([{ def: "d1", actual: "1520", name: "Väärennetty", formula: "1000000" }, { def: "d2", target: "50", actual: "25" }], effective());
  assert.equal(f.error, undefined);
  assert.equal(f.rows[0].name, "Liikevaihto", "nimi mallista");
  assert.equal(f.rows[0].formula, "ACTUAL / TARGET", "kaava mallista");
  assert.equal(f.rows[0].start, "2026-01-01");
  assert.equal(f.rows[1].target, "50", "lukitsematon voi saada oman arvon");
});

test("jäädytys: lukittu kenttä pysyy mallin arvona, ja virheelliset syötteet hylätään", () => {
  assert.equal(freezeRows([{ def: "d1", target: "1", actual: "1" }], effective()).rows[0].target, "1500");
  const bad = (rows) => freezeRows(rows, effective()).error;
  for (const rows of [
    "x", null, [null], [{}], [{ def: 5 }], [{ def: "ei-ole" }], [{ def: "d1" }, { def: "d1" }], [{ def: "d1", actual: { a: 1 } }], [{ def: "d1", actual: "x".repeat(31) }],
    Array.from({ length: 61 }, () => ({ def: "d1" }))
  ]) assert.ok(bad(rows), JSON.stringify(rows).slice(0, 60));
  assert.deepEqual(freezeRows([], effective()).rows, []);
  assert.equal(freezeRows([{ def: "d2", actual: 5 }], effective()).rows[0].actual, "5", "luku kelpaa tekstiksi muutettuna");
});

test("tulos lasketaan jäädytetystä kaavasta, myöhempi mallin muutos ei vaikuta", () => {
  const f = freezeRows([{ def: "d1", actual: "1520" }, { def: "d2", actual: "25" }], effective()).rows;
  const s = scoreForm(f);
  assert.ok(Math.abs(s.rows[0].score.result - 1520 / 1500) < 1e-9);
  assert.equal(s.total.count, 2);
  assert.ok(Math.abs(s.total.weighted - (1520 / 1500 * 0.2 + 25 / 40 * 0.1)) < 1e-9);
  assert.equal(s.total.weight, 30);
  const changed = Object.assign({}, D1, { data: Object.assign({}, D1.data, { target: "9999", formula: "0" }) });
  assert.ok(rowsFor(role, [changed], []).length === 1 && Math.abs(scoreSnapshot(f[0]).result - 1520 / 1500) < 1e-9, "vanha kuva ei muutu");
  assert.deepEqual(scoreForm(undefined).total, { weight: 0, weighted: 0, count: 0 });
  assert.equal(scoreSnapshot({ formula: "FOO", target: "1", actual: "1" }).error.includes("Tuntematon"), true);
});

test("luontipyynnön tarkistus: tyyppi, oikeus, taulukko ja kommentti", () => {
  const ctx = (isAdmin) => ({ types, isAdmin, effective: effective() });
  assert.ok(checkForm({ type: "kommentti", comment: "Hyvä" }, ctx(false)).ok);
  assert.equal(checkForm({ type: "arviointi", rows: [] }, ctx(false)).error, "Tyyppi ei ole sallittu.", "jäsen ei saa luoda arviointia");
  assert.ok(checkForm({ type: "arviointi", rows: [{ def: "d1", actual: "1" }] }, ctx(true)).ok);
  assert.equal(checkForm({ type: "ei-ole" }, ctx(true)).error, "Tyyppi ei ole sallittu.");
  assert.equal(checkForm({ type: "kommentti", rows: [{ def: "d1" }] }, ctx(true)).error, "Tyypillä ei ole taulukkoa.");
  assert.ok(checkForm({ type: "kommentti", rows: [] }, ctx(true)).ok, "tyhjä taulukko kelpaa");
  assert.ok(checkForm({ type: "ehdotus" }, ctx(false)).ok, "puuttuva taulukko tulkitaan tyhjäksi");
  assert.equal(checkForm({ type: "kommentti", comment: 5 }, ctx(true)).error, "Virheellinen kommentti.");
  assert.equal(checkForm({ type: "kommentti", comment: "x".repeat(5000) }, ctx(true)).comment.length, 4000);
  for (const bad of [null, "x", 5, []]) assert.ok(checkForm(bad, ctx(true)).error);
  assert.equal(checkForm({ type: "ehdotus", rows: [{ def: "toinen-rooli" }] }, ctx(true)).error, "Rivi ei kuulu roolin tavoitteisiin.");
});
