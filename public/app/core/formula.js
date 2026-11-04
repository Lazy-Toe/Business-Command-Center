// Mittarin laskentakaava ilman näkymää ja ilman eval:ia. Kaava on pieni lauseke: luvut (desimaalipiste), + - * / ja sulut,
// muuttujat RANGE_MIN, RANGE_MAX, TARGET ja ACTUAL sekä funktiot min, max, abs, round ja clamp.
// Tulkki hylkää kaiken muun jo jäsennysvaiheessa, joten kaavan kautta ei voi ajaa koodia.
export const VARS = ["RANGE_MIN", "RANGE_MAX", "TARGET", "ACTUAL"];
export const DEFAULT_FORMULA = "ACTUAL / TARGET";
export const FORMULA_PRESETS = [
  { label: "Isompi on parempi", formula: "ACTUAL / TARGET" },
  { label: "Pienempi on parempi", formula: "TARGET / ACTUAL" },
  { label: "Katettu ylärajaan", formula: "min(ACTUAL, RANGE_MAX) / TARGET" },
  { label: "Rajojen välissä", formula: "(ACTUAL - RANGE_MIN) / (RANGE_MAX - RANGE_MIN)" }
];

const MAX_LEN = 200, MAX_NODES = 80, MAX_DEPTH = 24;
const FUNCS = {
  min: { n: [2, 6], f: (...a) => Math.min(...a) },
  max: { n: [2, 6], f: (...a) => Math.max(...a) },
  abs: { n: [1, 1], f: (x) => Math.abs(x) },
  round: { n: [1, 2], f: (x, d = 0) => { const k = Math.pow(10, Math.max(0, Math.min(6, Math.floor(d)))); return Math.round(x * k) / k; } },
  clamp: { n: [3, 3], f: (x, lo, hi) => Math.min(Math.max(x, lo), hi) }
};

class FormulaError extends Error {}
const fail = (msg) => { throw new FormulaError(msg); };

function tokenize(s) {
  const toks = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    let m;
    if ((m = /^\d+(\.\d+)?/.exec(s.slice(i)))) { toks.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) { toks.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    if ("+-*/(),;".includes(c)) { toks.push({ t: c === ";" ? "," : c }); i++; continue; }
    fail("Kaavassa on merkki, jota ei sallita: " + c);
  }
  return toks;
}

function parse(toks) {
  let p = 0, nodes = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const node = (n) => { if (++nodes > MAX_NODES) fail("Kaava on liian monimutkainen."); return n; };
  const expect = (t) => { const x = next(); if (!x || x.t !== t) fail("Kaavassa on virhe: odotettiin merkkiä " + t + "."); };
  function expr(d) {
    if (d > MAX_DEPTH) fail("Kaavassa on liian monta sisäkkäistä sulkua.");
    let l = term(d);
    while (peek() && (peek().t === "+" || peek().t === "-")) { const op = next().t; l = node({ t: "bin", op, l, r: term(d) }); }
    return l;
  }
  function term(d) {
    let l = unary(d);
    while (peek() && (peek().t === "*" || peek().t === "/")) { const op = next().t; l = node({ t: "bin", op, l, r: unary(d) }); }
    return l;
  }
  function unary(d) {
    if (peek() && peek().t === "-") { next(); return node({ t: "neg", a: unary(d + 1) }); }
    return primary(d);
  }
  function primary(d) {
    const x = next();
    if (!x) fail("Kaava päättyy kesken.");
    if (x.t === "num") return node({ t: "num", v: x.v });
    if (x.t === "(") { const e = expr(d + 1); expect(")"); return e; }
    if (x.t === "id") {
      if (peek() && peek().t === "(") {
        const name = x.v.toLowerCase(), fn = FUNCS[name];
        if (!fn) fail("Tuntematon funktio: " + x.v + ". Käytettävissä: " + Object.keys(FUNCS).join(", ") + ".");
        next();
        const args = [];
        if (peek() && peek().t === ")") fail("Funktiolle " + name + " puuttuvat arvot.");
        for (;;) { args.push(expr(d + 1)); if (peek() && peek().t === ",") { next(); continue; } break; }
        expect(")");
        if (args.length < fn.n[0] || args.length > fn.n[1]) fail("Funktiolle " + name + " annettiin väärä määrä arvoja.");
        return node({ t: "call", name, args });
      }
      const name = x.v.toUpperCase();
      if (!VARS.includes(name)) fail("Tuntematon nimi: " + x.v + ". Käytettävissä: " + VARS.join(", ") + ".");
      return node({ t: "var", name });
    }
    fail("Kaavassa on virhe kohdassa " + x.t + ".");
  }
  const e = expr(0);
  if (p < toks.length) fail("Kaavassa on ylimääräistä sisältöä.");
  return e;
}

class Missing extends Error {}
function run(n, v) {
  switch (n.t) {
    case "num": return n.v;
    case "var": { const x = v[n.name]; if (x == null || !isFinite(x)) throw new Missing(n.name); return x; }
    case "neg": return -run(n.a, v);
    case "bin": {
      const a = run(n.l, v), b = run(n.r, v);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : a / b;
    }
    default: return FUNCS[n.name].f(...n.args.map((a) => run(a, v)));
  }
}
const names = (n, set = new Set()) => { if (n.t === "var") set.add(n.name); if (n.a) names(n.a, set); if (n.l) { names(n.l, set); names(n.r, set); } (n.args || []).forEach((a) => names(a, set)); return set; };

// compile: { ok: true, vars, run(arvot) } tai { ok: false, error }. run palauttaa { value, missing }:
// value on null, jos jokin tarvittu arvo puuttuu tai laskenta ei ole mahdollinen (esimerkiksi jako nollalla).
export function compile(src) {
  try {
    const s = String(src == null ? "" : src).trim();
    if (!s) fail("Kaava on tyhjä.");
    if (s.length > MAX_LEN) fail("Kaava on liian pitkä (enintään " + MAX_LEN + " merkkiä).");
    const ast = parse(tokenize(s));
    return {
      ok: true, vars: [...names(ast)],
      run(vals) {
        try { const x = run(ast, vals || {}); return { value: isFinite(x) ? x : null, missing: [] }; }
        catch (e) { if (e instanceof Missing) return { value: null, missing: [e.message] }; throw e; }
      }
    };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message };
    throw e;
  }
}
