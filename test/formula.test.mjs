import test from "node:test";
import assert from "node:assert/strict";
import { compile, FORMULA_PRESETS, DEFAULT_FORMULA, FUNCTION_NAMES } from "../public/app/core/formula.js";

const V = { TARGET: 1500, ACTUAL: 1520, RANGE_MIN: 1400, RANGE_MAX: 1800 };
const val = (src, vars = V, opts) => { const c = compile(src, opts); assert.ok(c.ok, src + ": " + c.error); return c.run(vars).value; };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + " != " + b);

test("laskujärjestys, sulut ja etumerkki", () => {
  assert.equal(val("1 + 2 * 3"), 7);
  assert.equal(val("(1 + 2) * 3"), 9);
  assert.equal(val("10 - 4 - 3"), 3);
  assert.equal(val("12 / 4 / 3"), 1);
  assert.equal(val("-2 * -3"), 6);
  assert.equal(val("2 - -1"), 3);
  assert.equal(val("0.5 + 0.25"), 0.75);
  assert.equal(val("7 % 4"), 3);
  assert.equal(val("7 mod 4"), 3);
});

test("potenssi: oikealle liittyvä ja etumerkkiä tiukempi kuten math.js:ssä", () => {
  assert.equal(val("2 ^ 3 ^ 2"), 512);
  assert.equal(val("-2 ^ 2"), -4);
  assert.equal(val("2 ^ -1"), 0.5);
  assert.equal(val("(-2) ^ 2"), 4);
  assert.equal(val("2 * 3 ^ 2"), 18);
  assert.equal(val("1e3 + 2.5e-1"), 1000.25);
});

test("vertailut, loogiset operaattorit ja ehtolauseke", () => {
  assert.equal(val("3 > 2"), 1);
  assert.equal(val("3 < 2"), 0);
  assert.equal(val("3 >= 3 and 2 != 2"), 0);
  assert.equal(val("1 == 1 or 0"), 1);
  assert.equal(val("1 xor 1"), 0);
  assert.equal(val("not 0"), 1);
  assert.equal(val("!(1 > 2)"), 1);
  assert.equal(val("1 && 0 || 1"), 1);
  assert.equal(val("ACTUAL >= TARGET ? 1 : 0"), 1);
  assert.equal(val("ACTUAL >= RANGE_MAX ? 2 : ACTUAL >= TARGET ? 1 : 0"), 1, "sisäkkäinen ehto");
  assert.equal(val("if(ACTUAL < RANGE_MIN, 0, ACTUAL / TARGET)"), 1520 / 1500);
  assert.equal(val("true + false + true"), 2);
});

test("ehtolauseke laskee vain valitun haaran, joten käyttämättömän haaran puuttuva arvo tai jako nollalla ei haittaa", () => {
  assert.equal(val("1 ? 5 : ACTUAL", {}), 5);
  assert.equal(val("0 ? 1 / 0 : 7", {}), 7);
  const c = compile("ACTUAL > 0 ? ACTUAL : TARGET");
  assert.deepEqual(c.run({ ACTUAL: 4 }), { value: 4, missing: [] });
  assert.deepEqual(c.run({ ACTUAL: 0 }), { value: null, missing: ["TARGET"] });
});

test("funktiot math.js:n nimillä", () => {
  assert.equal(val("abs(-4)"), 4);
  assert.equal(val("ceil(1.2) + floor(1.8) + fix(-1.9)"), 2);
  assert.equal(val("round(2.567, 1)"), 2.6);
  assert.equal(val("round(2.5)"), 3);
  assert.equal(val("sign(-5)"), -1);
  assert.equal(val("sqrt(16) + cbrt(27) + square(3) + cube(2)"), 24);
  assert.equal(val("pow(2, 10)"), 1024);
  assert.equal(val("mod(10, 4)"), 2);
  assert.equal(val("nthRoot(27, 3)"), 3);
  assert.equal(val("hypot(3, 4)"), 5);
  near(val("exp(1)"), Math.E);
  near(val("log(100, 10)"), 2);
  near(val("log(e)"), 1);
  assert.equal(val("log10(1000)"), 3);
  assert.equal(val("log2(8)"), 3);
  assert.equal(val("factorial(5)"), 120);
  assert.equal(val("combinations(5, 2)"), 10);
  assert.equal(val("permutations(5, 2)"), 20);
  assert.equal(val("clamp(5, 0, 1)"), 1);
  near(val("sin(pi / 2)"), 1);
  near(val("cos(0) + atan2(1, 1) * 4 / pi"), 2);
});

test("tilastofunktiot", () => {
  assert.equal(val("min(3, 5)"), 3);
  assert.equal(val("max(3; 5; 9)"), 9);
  assert.equal(val("sum(1, 2, 3, 4)"), 10);
  assert.equal(val("prod(2, 3, 4)"), 24);
  assert.equal(val("mean(2, 4, 9)"), 5);
  assert.equal(val("median(9, 1, 5)"), 5);
  assert.equal(val("median(1, 2, 3, 10)"), 2.5);
  near(val("variance(2, 4, 4, 4, 5, 5, 7, 9)"), 4.571428571428571);
  near(val("std(2, 4, 4, 4, 5, 5, 7, 9)"), 2.138089935299395);
});

test("funktioiden nimet ovat kirjainkoosta riippumattomia, muuttujat myös", () => {
  assert.equal(val("MIN(ACTUAL, TARGET)"), 1500);
  assert.equal(val("NthRoot(8, 3)"), 2);
  assert.equal(val("actual / target", { TARGET: 100, ACTUAL: 90 }), 0.9);
});

test("kaavat vastaavat esimerkin tuloksia", () => {
  near(val(DEFAULT_FORMULA), 1520 / 1500);
  assert.equal(val(FORMULA_PRESETS[1].formula, { TARGET: 5, ACTUAL: 10 }), 0.5);
  assert.equal(val(FORMULA_PRESETS[2].formula, { ...V, ACTUAL: 2000 }), 1.2, "kate yläraja 1800 / tavoite 1500");
  assert.equal(val(FORMULA_PRESETS[3].formula, { RANGE_MIN: 10, RANGE_MAX: 30, ACTUAL: 20 }), 0.5);
  assert.ok(FUNCTION_NAMES.includes("mean") && FUNCTION_NAMES.includes("if"));
});

test("muuttujat annetaan kutsujan listana ja kirjoitetaan nimenä tai {nimi}: bonuskaavan esimerkki", () => {
  const o = { vars: ["MONTHLY_SALARY", "SCORE", "TARGET_EARNING", "ANNUAL_SALARY", "BONUS_VALUE"] };
  assert.equal(val("{MONTHLY_SALARY}*0,2*{SCORE}", { MONTHLY_SALARY: 3000, SCORE: 0.75 }, o), 450);
  assert.equal(val("{monthly_salary} * 0.2 * score", { MONTHLY_SALARY: 3000, SCORE: 0.75 }, o), 450);
  assert.equal(val("min({ANNUAL_SALARY} * 0.1, {TARGET_EARNING}) * {SCORE}", { ANNUAL_SALARY: 36000, TARGET_EARNING: 3000, SCORE: 0.75 }, o), 2250);
  assert.equal(val("min({ANNUAL_SALARY} * 0,1; {TARGET_EARNING}) * {SCORE}", { ANNUAL_SALARY: 36000, TARGET_EARNING: 3000, SCORE: 0.75 }, o), 2250, "puolipisteellä erotetussa kutsussa pilkku on desimaali");
  const c = compile("ACTUAL / 2", o);
  assert.equal(c.ok, false, "listan ulkopuolinen nimi hylätään");
  assert.ok(c.error.includes("MONTHLY_SALARY"), "viesti listaa sallitut nimet");
  assert.deepEqual(compile("{SCORE} * {SCORE} + BONUS_VALUE", o).vars.sort(), ["BONUS_VALUE", "SCORE"]);
});

test("desimaalipilkku sulkujen ulkopuolella, funktiokutsun sisällä pilkku erottaa arvot", () => {
  assert.equal(val("0,2 * 5"), 1);
  assert.equal(val("(0,5 + 0,25) * 4"), 3);
  assert.equal(val("min(1, 2)"), 1, "ei muutu desimaaliluvuksi 1,2");
  assert.equal(val("min(1,2)"), 1);
  assert.equal(val("max(1; 2,5)"), 2.5, "kutsussa, jonka erotin on puolipiste, pilkku on desimaalimerkki");
  assert.equal(val("max(1; 2.5) + 0,5"), 3);
  assert.equal(val("mod(10,4)"), 2, "mod funktiona: pilkku erottaa");
  assert.equal(val("7 mod (4)"), 3, "mod operaattorina, sulku on ryhmä");
  assert.equal(val("min(max(1, 2), 3)"), 2, "sisäkkäiset kutsut");
  assert.equal(val("min(2,5; 3)"), 2.5);
  assert.equal(compile("1,2,3").ok, false);
});

test("puuttuva arvo tai jako nollalla ei anna tulosta eikä kaada", () => {
  const c = compile("ACTUAL / TARGET");
  assert.deepEqual(c.run({ TARGET: 100 }), { value: null, missing: ["ACTUAL"] });
  assert.deepEqual(c.run({ TARGET: null, ACTUAL: 5 }), { value: null, missing: ["TARGET"] });
  assert.equal(c.run({ TARGET: 0, ACTUAL: 5 }).value, null);
  assert.equal(compile("1 / 0").run({}).value, null);
  assert.equal(compile("sqrt(-1)").run({}).value, null);
  assert.equal(compile("factorial(500)").run({}).value, null);
  assert.equal(compile("9 ^ 9 ^ 9").run({}).value, null);
  assert.deepEqual(compile("ACTUAL + TARGET").vars.sort(), ["ACTUAL", "TARGET"]);
});

test("virheelliset kaavat hylätään ymmärrettävällä viestillä", () => {
  for (const [src, part] of [
    ["", "tyhjä"], ["   ", "tyhjä"], ["1 +", "päättyy"], ["(1 + 2", "odotettiin"], ["1 + 2)", "ylimääräinen sulje"], ["1 2", "ylimääräistä"],
    ["FOO + 1", "Tuntematon nimi"], ["foo(1)", "Tuntematon funktio"], ["min()", "puuttuvat"], ["abs(1, 2)", "väärä määrä"], ["if(1, 2)", "väärä määrä"],
    ["1 $ 2", "ei sallita"], ["x".repeat(501), "liian pitkä"], ["(".repeat(40) + "1" + ")".repeat(40), "sisäkkäistä"],
    ["1+".repeat(200) + "1", "monimutkainen"], ["1 ? 2", "odotettiin"], ["and 1", "väärässä kohdassa"], ["ACTUAL and", "päättyy"]
  ]) {
    const c = compile(src);
    assert.equal(c.ok, false, JSON.stringify(src));
    assert.ok(c.error.includes(part), src + " -> " + c.error);
  }
});

test("kaavan kautta ei voi ajaa koodia eikä päästä olioiden ominaisuuksiin", () => {
  for (const src of [
    "constructor", "ACTUAL.constructor", "__proto__", "this", "globalThis", "process.exit(1)", "alert(1)", "(() => 1)()",
    "`x`", "'a'", "\"a\"", "ACTUAL; process", "ACTUAL[0]", "{}", "{constructor}", "{__proto__}", "ACTUAL ** 2", "0x10", "ACTUAL\nTARGET",
    "toString()", "hasOwnProperty(1)", "valueOf", "Math.max(1, 2)", "max.call(1)", "ACTUAL = 1", "a => a", "import('x')", "eval(1)", "Function('x')"
  ]) assert.equal(compile(src).ok, false, src);
  // Funktion nimi ei saa osua Object-prototyypin ominaisuuksiin.
  for (const n of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) assert.equal(compile(n + "(1)").ok, false, n);
});

test("satunnaiset syötteet eivät kaada tulkkia: tulos on aina ok-vastaus tai virheviesti", () => {
  const alphabet = "0123456789.,;+-*/%^()<>=!&|?:{} \tabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$#\"'`\\[]@~\n";
  const words = ["min", "max", "if", "and", "or", "not", "mod", "ACTUAL", "TARGET", "{SCORE}", "pi", "e", "sqrt", "round", "1e9", "0,5", "factorial", "(", ")", "?", ":"];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let i = 0; i < 4000; i++) {
    let src = "";
    for (let k = rnd(14); k >= 0; k--) src += rnd(3) ? words[rnd(words.length)] + (rnd(2) ? " " : "") : alphabet[rnd(alphabet.length)];
    const c = compile(src, { vars: ["ACTUAL", "TARGET", "SCORE"] });
    assert.equal(typeof c.ok, "boolean", JSON.stringify(src));
    if (c.ok) { const r = c.run({ ACTUAL: 3, TARGET: 4, SCORE: 0.5 }); assert.ok(r.value === null || Number.isFinite(r.value), JSON.stringify(src)); } else assert.ok(typeof c.error === "string" && c.error.length > 0, JSON.stringify(src));
  }
  assert.equal(compile("(".repeat(100000)).ok, false, "pitkä syöte hylätään heti");
});
