import test from "node:test";
import assert from "node:assert/strict";
import { cleanFields, cleanRules, cleanPerson, varsOf, payResult, scoreOfPerson, fmtMoney, KEY_RE } from "../public/app/core/pay.js";

const FIELDS = [{ key: "MONTHLY_SALARY", label: "Kuukausipalkka", unit: "EUR" }, { key: "TARGET_EARNING", label: "Tavoiteansio", unit: "EUR" }, { key: "BONUS_VALUE", label: "Bonus", unit: "%" }];
const RULE = { id: "r-bonus", name: "Bonus Field Sales", formula: "{MONTHLY_SALARY}*0,2*{SCORE}", active: true };

test("kenttien määrittely: tunniste isoilla kirjaimilla, otsikko pakollinen, SCORE varattu ja kaksoiskappaleet kielletty", () => {
  const r = cleanFields([{ key: " monthly_salary ", label: "  Kuukausipalkka  ", unit: "EUR" }, { key: "A1", label: "Toinen" }]);
  assert.deepEqual(r.fields, [{ key: "MONTHLY_SALARY", label: "Kuukausipalkka", unit: "EUR" }, { key: "A1", label: "Toinen", unit: "" }]);
  for (const bad of [
    null, "x", [null], [{ key: "1A", label: "x" }], [{ key: "A B", label: "x" }], [{ key: "A-B", label: "x" }], [{ key: "ÄÖ", label: "x" }], [{ key: "", label: "x" }],
    [{ key: "SCORE", label: "x" }], [{ key: "score", label: "x" }], [{ key: "A", label: "x" }, { key: "a", label: "y" }], [{ key: "A", label: "" }], [{ key: "A" }], [{ key: "A", label: 5 }],
    [{ key: "A".repeat(42), label: "x" }], Array.from({ length: 51 }, (_, i) => ({ key: "K" + i, label: "x" }))
  ]) assert.ok(cleanFields(bad).error, JSON.stringify(bad).slice(0, 60));
  assert.deepEqual(cleanFields([]).fields, []);
  assert.ok(KEY_RE.test("BONUS_VALUE") && !KEY_RE.test("bonus"));
  assert.deepEqual(varsOf(FIELDS), ["SCORE", "MONTHLY_SALARY", "TARGET_EARNING", "BONUS_VALUE"]);
});

test("säännöt: kaavan pitää kääntyä vain SCORE:lla ja määritellyillä kentillä, nimi ja tunniste pakollisia", () => {
  const ok = cleanRules([RULE, { id: "r2", name: "Toinen", formula: "min({TARGET_EARNING}; {MONTHLY_SALARY} * {SCORE})", active: false, unit: "USD" }], FIELDS);
  assert.equal(ok.error, undefined);
  assert.deepEqual([ok.rules[0].active, ok.rules[0].unit, ok.rules[1].active, ok.rules[1].unit], [true, "EUR", false, "USD"]);
  for (const bad of [
    null, [null], [{ ...RULE, id: "" }], [{ ...RULE, id: "a b" }], [{ ...RULE, name: "" }], [{ ...RULE, formula: "" }], [{ ...RULE, formula: "FOO * 2" }], [{ ...RULE, formula: "constructor" }],
    [{ ...RULE, formula: "ACTUAL * 2" }], [RULE, RULE], [{ ...RULE, formula: 5 }], [{ ...RULE, formula: "1 +" }]
  ]) assert.ok(cleanRules(bad, FIELDS).error, JSON.stringify(bad).slice(0, 70));
  assert.ok(cleanRules([RULE], []).error, "kenttä, jota ei ole määritelty, ei kelpaa");
});

test("henkilön tiedot: sääntö on olemassa, arvot lukuja, tuntemattomat kentät ja prototyyppiavaimet hylätään", () => {
  const rules = [RULE];
  assert.deepEqual(cleanPerson({ rule: "r-bonus", values: { MONTHLY_SALARY: " 3 000 ", TARGET_EARNING: "" } }, FIELDS, rules).pay, { rule: "r-bonus", values: { MONTHLY_SALARY: "3 000" } });
  assert.deepEqual(cleanPerson({}, FIELDS, rules).pay, { rule: "", values: {} });
  assert.deepEqual(cleanPerson({ rule: "", values: { BONUS_VALUE: 0.15 } }, FIELDS, rules).pay, { rule: "", values: { BONUS_VALUE: "0.15" } });
  for (const bad of [
    null, [], "x", { rule: "ei-ole" }, { rule: 5 }, { values: { OUTO: "1" } }, { values: { MONTHLY_SALARY: "paljon" } }, { values: { MONTHLY_SALARY: "1".repeat(31) } },
    { values: JSON.parse('{"__proto__": "1"}') }, { values: JSON.parse('{"constructor": "1"}') }
  ]) assert.ok(cleanPerson(bad, FIELDS, rules).error, JSON.stringify(bad));
});

test("säännön tulos euroina: esimerkin 3000 * 0,2 * 0,75 on 450", () => {
  const r = payResult(RULE, FIELDS, { MONTHLY_SALARY: "3000" }, 0.75);
  assert.equal(r.value, 450);
  assert.equal(payResult(RULE, FIELDS, { MONTHLY_SALARY: "3 000,5" }, 1).value, 600.1, "välilyönti ja pilkku luvussa");
  assert.deepEqual(payResult(RULE, FIELDS, {}, 0.75), { value: null, missing: ["MONTHLY_SALARY"], error: "" }, "puuttuva kenttä");
  assert.deepEqual(payResult(RULE, FIELDS, { MONTHLY_SALARY: "3000" }, null).missing, ["SCORE"], "ilman pisteytystä ei tulosta");
  assert.deepEqual(payResult(null, FIELDS, {}, 1), { value: null, missing: [], error: "" });
  assert.ok(payResult({ ...RULE, formula: "FOO" }, FIELDS, {}, 1).error);
  assert.equal(payResult({ formula: "min({MONTHLY_SALARY} * 0.1; {TARGET_EARNING}) * {SCORE}" }, FIELDS, { MONTHLY_SALARY: "36000", TARGET_EARNING: "3000" }, 0.75).value, 2250);
});

test("raha suomalaisittain", () => {
  assert.equal(fmtMoney(3000), "3 000,00 EUR");
  assert.equal(fmtMoney(450), "450,00 EUR");
  assert.equal(fmtMoney(1234567.891, "USD"), "1 234 567,89 USD");
  assert.equal(fmtMoney(null), "–");
  assert.equal(fmtMoney(NaN), "–");
  assert.equal(fmtMoney(5, ""), "5,00");
});

const T = ["p", "q", "ERI"].flatMap((plan_id) => [{ id: "arviointi", plan_id, data: { score: true } }, { id: "kommentti", plan_id, data: {} }]).filter((t) => t.plan_id !== "ERI" || t.id === "kommentti");
const roles = [{ id: "r1", plan_id: "p", data: { owner: "Mika" } }, { id: "r2", plan_id: "q", data: { owner: " mika " } }, { id: "r3", plan_id: "p", data: { owner: "Iida" } }];
const rows = (actual) => [{ def: "d", formula: "ACTUAL / TARGET", target: "100", min: "", max: "", weight: "100", start: "", end: "", actual }];
const f = (id, parent, plan, type, at, actual) => ({ id, parent_id: parent, plan_id: plan, data: { type, at, rows: rows(actual) } });

test("SCORE: viimeisin pisteytyslomake roolia kohden, keskiarvo rooleista, muut tyypit ja toisten roolit ohitetaan", () => {
  const forms = [f("a", "r1", "p", "arviointi", "2026-01-01", "50"), f("b", "r1", "p", "arviointi", "2026-03-01", "80"), f("c", "r1", "p", "kommentti", "2026-04-01", "100"), f("d", "r3", "p", "arviointi", "2026-05-01", "10")];
  const one = scoreOfPerson("Mika", roles, forms, T);
  assert.equal(one.score, 0.8, "uusin arviointi, ei kommenttia");
  assert.equal(one.parts.length, 1);
  const two = scoreOfPerson("MIKA", roles, forms.concat(f("e", "r2", "q", "arviointi", "2026-02-01", "60")), T);
  assert.ok(Math.abs(two.score - 0.7) < 1e-9, "keskiarvo kahdesta roolista: (0,8 + 0,6) / 2");
  assert.equal(scoreOfPerson("Iida", roles, forms, T).score, 0.1);
  assert.equal(scoreOfPerson("Olematon", roles, forms, T).score, null);
  assert.equal(scoreOfPerson("Mika", roles, [], T).score, null);
  assert.equal(scoreOfPerson("Mika", roles, [f("x", "r1", "p", "arviointi", "2026-01-01", "")], T).score, null, "lomake ilman toteumia ei anna pisteytystä");
  assert.equal(scoreOfPerson("Mika", roles, [f("x", "r1", "ERI", "arviointi", "2026-01-01", "50")], T).score, null, "saman tunnisteen rooli toisessa suunnitelmassa ei sekoitu");
  assert.equal(scoreOfPerson("Mika", roles, [f("x", "r1", "p", "arviointi", "2026-01-01", "50")], T.filter((t) => t.plan_id !== "p")).score, null, "toisen suunnitelman pisteytystyyppi ei päde");
});
