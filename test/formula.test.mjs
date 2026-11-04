import test from "node:test";
import assert from "node:assert/strict";
import { compile, FORMULA_PRESETS, DEFAULT_FORMULA } from "../public/app/core/formula.js";

const V = { TARGET: 1500, ACTUAL: 1520, RANGE_MIN: 1400, RANGE_MAX: 1800 };
const val = (src, vars = V) => { const c = compile(src); assert.ok(c.ok, src + ": " + c.error); return c.run(vars).value; };

test("laskujärjestys, sulut ja etumerkki", () => {
  assert.equal(val("1 + 2 * 3"), 7);
  assert.equal(val("(1 + 2) * 3"), 9);
  assert.equal(val("10 - 4 - 3"), 3);
  assert.equal(val("12 / 4 / 3"), 1);
  assert.equal(val("-2 * -3"), 6);
  assert.equal(val("2 - -1"), 3);
  assert.equal(val("0.5 + 0.25"), 0.75);
});

test("muuttujat ovat kirjainkoosta riippumattomia ja kaavat vastaavat esimerkin tuloksia", () => {
  assert.ok(Math.abs(val(DEFAULT_FORMULA) - 1.0133333) < 1e-6);
  assert.equal(val("actual / target", { TARGET: 100, ACTUAL: 90 }), 0.9);
  assert.equal(val(FORMULA_PRESETS[1].formula, { TARGET: 5, ACTUAL: 10 }), 0.5);
  assert.equal(val(FORMULA_PRESETS[2].formula, { ...V, ACTUAL: 2000 }), 1.2, "kate yläraja 1800 / tavoite 1500");
  assert.equal(val(FORMULA_PRESETS[3].formula, { RANGE_MIN: 10, RANGE_MAX: 30, ACTUAL: 20 }), 0.5);
});

test("funktiot ja erottimet: pilkku ja puolipiste kelpaavat", () => {
  assert.equal(val("min(3, 5)"), 3);
  assert.equal(val("max(3; 5; 9)"), 9);
  assert.equal(val("abs(-4)"), 4);
  assert.equal(val("round(2.567, 1)"), 2.6);
  assert.equal(val("round(2.5)"), 3);
  assert.equal(val("clamp(5, 0, 1)"), 1);
  assert.equal(val("MIN(ACTUAL, TARGET)"), 1500);
});

test("puuttuva arvo tai jako nollalla ei anna tulosta eikä kaada", () => {
  const c = compile("ACTUAL / TARGET");
  assert.deepEqual(c.run({ TARGET: 100 }), { value: null, missing: ["ACTUAL"] });
  assert.deepEqual(c.run({ TARGET: null, ACTUAL: 5 }), { value: null, missing: ["TARGET"] });
  assert.equal(c.run({ TARGET: 0, ACTUAL: 5 }).value, null);
  assert.equal(compile("1 / 0").run({}).value, null);
  assert.deepEqual(compile("ACTUAL + TARGET").vars.sort(), ["ACTUAL", "TARGET"]);
});

test("virheelliset kaavat hylätään ymmärrettävällä viestillä", () => {
  for (const [src, part] of [
    ["", "tyhjä"], ["   ", "tyhjä"], ["1 +", "päättyy"], ["(1 + 2", "odotettiin"], ["1 + 2)", "ylimääräistä"], ["1 2", "ylimääräistä"],
    ["FOO + 1", "Tuntematon nimi"], ["foo(1)", "Tuntematon funktio"], ["min(1)", "väärä määrä"], ["min()", "puuttuvat"], ["abs(1, 2)", "väärä määrä"],
    ["1 $ 2", "ei sallita"], ["x".repeat(201), "liian pitkä"], ["(".repeat(40) + "1" + ")".repeat(40), "sisäkkäistä"],
    ["1+".repeat(50) + "1", "monimutkainen"], ["1,2", "ylimääräistä"]
  ]) {
    const c = compile(src);
    assert.equal(c.ok, false, JSON.stringify(src));
    assert.ok(c.error.includes(part), src + " -> " + c.error);
  }
});

test("kaavan kautta ei voi ajaa koodia eikä päästä olioiden ominaisuuksiin", () => {
  for (const src of [
    "constructor", "ACTUAL.constructor", "__proto__", "this", "globalThis", "process.exit(1)", "alert(1)", "(() => 1)()",
    "`x`", "'a'", "\"a\"", "ACTUAL; process", "ACTUAL[0]", "{}", "ACTUAL ? 1 : 2", "ACTUAL == 1", "ACTUAL ** 2", "1e3", "0x10", "ACTUAL\nTARGET"
  ]) assert.equal(compile(src).ok, false, src);
  assert.equal(compile("1e3").ok, false);
});
