import test from "node:test";
import assert from "node:assert/strict";
import { calcGoals, template, cleanNum, fmt } from "../public/app/core/calc.js";

const input = {
  baseYear: "2026", targetYear: "2027", estTotal: "6.574", projYears: [2027, 2028],
  lines: [{ id: "a", share: "5", g: "15", m: "12" }, { id: "b", share: "3", g: "10", m: "8" }]
};

test("arvio jaetaan osuuksilla, luvut vastaavat vanhan sivun tuloksia", () => {
  const r = calcGoals(input);
  assert.equal(fmt(r.lines.a.base, 2), "4,11");
  assert.equal(fmt(r.lines.b.base, 2), "2,47");
  assert.equal(fmt(r.lines.a.target, 2), "4,73");
  assert.equal(fmt(r.lines.b.target, 2), "2,71");
  assert.equal(fmt(r.totTarget, 2), "7,44");
  assert.equal(fmt(r.totGrowth, 1), "13,1");
  assert.equal(fmt(r.totMargin, 1), "10,5");
  assert.equal(r.est, true);
  assert.equal(r.r40.sum, 27);
});

test("kokonaisluku korvaa arvion ja jäännös menee puuttuvalle riville", () => {
  let r = calcGoals({ ...input, totRev: "8" });
  assert.equal(r.lines.a.base, 5);
  assert.equal(r.est, false);
  r = calcGoals({ ...input, totRev: "8", lines: [{ ...input.lines[0], rev: "6" }, input.lines[1]] });
  assert.equal(r.lines.b.base, 2);
});

test("puuttuva kasvu ei tuota lukua", () => {
  const r = calcGoals({ ...input, lines: [{ id: "a", share: "1" }] });
  assert.equal(r.totTarget, null);
  assert.equal(r.r40, null);
  assert.equal(r.proj[0].tot, null);
});

test("ei rivejä ei kaada laskentaa", () => {
  const r = calcGoals({ baseYear: "2026", lines: [], projYears: [2027] });
  assert.equal(r.totTarget, null);
  assert.equal(r.values.perus, null);
});

test("tekstin lukuviittaukset ja varateksti", () => {
  const v = { perus: 4.11, tavoite: null, nettopito: 102.5, "~": "≈ " };
  assert.equal(template("≈ {perus*0.05:2} M€", "", v), "≈ 0,21 M€");
  assert.equal(template("{~}{perus:1} M€ → {tavoite:1} M€", "{~}{perus:1} M€", v), "≈ 4,1 M€");
  assert.equal(template("Nettopito → {nettopito:a} %", "Nettopito ↑", v), "Nettopito → 102,5 %");
  assert.equal(template("Nettopito → {nettopito:a} %", "Nettopito ↑", { nettopito: null }), "Nettopito ↑");
  assert.equal(template("Pelkkä teksti", "", {}), "Pelkkä teksti");
});

test("syötteen siivous", () => {
  assert.equal(cleanNum("12,5 %"), "12.5");
  assert.equal(cleanNum(""), "");
  assert.equal(cleanNum("abc"), null);
});
