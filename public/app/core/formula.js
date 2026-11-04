// Laskentakaava ilman näkymää ja ilman eval:ia, kieli on math.js:n tapainen osajoukko.
// Operaattorit: + - * / % (jakojäännös) ^ (potenssi), vertailut == != < > <= >=, looginen and or xor not (myös && || !),
// ehtolauseke ehto ? a : b sekä sulut. Arvot ovat lukuja, ja tosi on 1 ja epätosi 0.
// Muuttujat ovat sallitun listan nimiä kirjoitettuna NIMI tai {NIMI}. Vakiot pi, e, true ja false. Desimaalimerkki on piste, ja
// sulkujen ulkopuolella myös pilkku. Funktiokutsun sisällä pilkku erottaa argumentit, paitsi jos kutsussa käytetään puolipistettä
// erottimena: silloin pilkku on desimaalimerkki (max(1; 2,5) on 2,5 ja max(1, 2) on 2).
// Tulkki hylkää jo jäsennysvaiheessa kaiken muun, joten kaavan kautta ei voi ajaa koodia.
export const VARS = ["RANGE_MIN", "RANGE_MAX", "TARGET", "ACTUAL"];
export const DEFAULT_FORMULA = "ACTUAL / TARGET";
export const FORMULA_PRESETS = [
  { label: "Isompi on parempi", formula: "ACTUAL / TARGET" },
  { label: "Pienempi on parempi", formula: "TARGET / ACTUAL" },
  { label: "Katettu ylärajaan", formula: "min(ACTUAL, RANGE_MAX) / TARGET" },
  { label: "Rajojen välissä", formula: "(ACTUAL - RANGE_MIN) / (RANGE_MAX - RANGE_MIN)" }
];

const MAX_LEN = 500, MAX_NODES = 300, MAX_DEPTH = 30, MAX_ARGS = 30;
const fact = (n) => { if (!Number.isInteger(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;
const variance = (a) => (a.length < 2 ? NaN : a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1));
const median = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const roundTo = (x, d = 0) => { const k = Math.pow(10, Math.max(0, Math.min(10, Math.floor(d)))); return Math.round(x * k) / k; };
// n: sallittu argumenttien määrä [vähintään, enintään], f saa argumentit lukuina.
const FUNCS = {
  abs: { n: [1, 1], f: Math.abs }, ceil: { n: [1, 1], f: Math.ceil }, floor: { n: [1, 1], f: Math.floor }, fix: { n: [1, 1], f: Math.trunc },
  round: { n: [1, 2], f: roundTo }, sign: { n: [1, 1], f: Math.sign }, sqrt: { n: [1, 1], f: Math.sqrt }, cbrt: { n: [1, 1], f: Math.cbrt },
  square: { n: [1, 1], f: (x) => x * x }, cube: { n: [1, 1], f: (x) => x * x * x }, exp: { n: [1, 1], f: Math.exp },
  log: { n: [1, 2], f: (x, b) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b)) }, log10: { n: [1, 1], f: Math.log10 }, log2: { n: [1, 1], f: Math.log2 },
  pow: { n: [2, 2], f: Math.pow }, mod: { n: [2, 2], f: (x, y) => x % y }, nthRoot: { n: [1, 2], f: (x, r = 2) => (x < 0 && r % 2 ? -Math.pow(-x, 1 / r) : Math.pow(x, 1 / r)) },
  hypot: { n: [1, MAX_ARGS], f: Math.hypot }, min: { n: [1, MAX_ARGS], f: Math.min }, max: { n: [1, MAX_ARGS], f: Math.max },
  sum: { n: [1, MAX_ARGS], f: (...a) => sum(a) }, prod: { n: [1, MAX_ARGS], f: (...a) => a.reduce((x, y) => x * y, 1) }, mean: { n: [1, MAX_ARGS], f: (...a) => mean(a) },
  median: { n: [1, MAX_ARGS], f: (...a) => median(a) }, variance: { n: [2, MAX_ARGS], f: (...a) => variance(a) }, std: { n: [2, MAX_ARGS], f: (...a) => Math.sqrt(variance(a)) },
  sin: { n: [1, 1], f: Math.sin }, cos: { n: [1, 1], f: Math.cos }, tan: { n: [1, 1], f: Math.tan }, asin: { n: [1, 1], f: Math.asin }, acos: { n: [1, 1], f: Math.acos },
  atan: { n: [1, 1], f: Math.atan }, atan2: { n: [2, 2], f: Math.atan2 }, sinh: { n: [1, 1], f: Math.sinh }, cosh: { n: [1, 1], f: Math.cosh }, tanh: { n: [1, 1], f: Math.tanh },
  factorial: { n: [1, 1], f: fact }, combinations: { n: [2, 2], f: (n, k) => (k > n ? NaN : fact(n) / (fact(k) * fact(n - k))) }, permutations: { n: [1, 2], f: (n, k = n) => (k > n ? NaN : fact(n) / fact(n - k)) },
  clamp: { n: [3, 3], f: (x, lo, hi) => Math.min(Math.max(x, lo), hi) },
  if: { n: [3, 3], f: null } // laiska: vain valittu haara lasketaan
};
export const FUNCTION_NAMES = Object.keys(FUNCS);
// Funktioiden nimet tunnistetaan kirjainkoosta riippumatta (MIN, min, nthRoot ja NTHROOT kelpaavat).
const FUNC_BY_LOWER = Object.fromEntries(FUNCTION_NAMES.map((n) => [n.toLowerCase(), n]));
const CONSTS = { pi: Math.PI, e: Math.E, true: 1, false: 0 };
const WORD_OPS = new Set(["and", "or", "xor", "not", "mod"]);

class FormulaError extends Error {}
const fail = (msg) => { throw new FormulaError(msg); };

function tokenize(s) {
  const toks = [], parens = [];
  // Pilkku on desimaalimerkki ryhmässä tai kutsussa, jonka erotin on puolipiste. Muuten funktiokutsussa se erottaa argumentit.
  const commaIsSeparator = () => parens.length > 0 && parens[parens.length - 1] === "call";
  const hasTopLevelSemicolon = (from) => { for (let k = from, depth = 0; k < s.length; k++) { if (s[k] === "(") depth++; else if (s[k] === ")") { if (!depth) return false; depth--; } else if (s[k] === ";" && !depth) return true; } return false; };
  const operandBefore = (k) => { const t = toks[k]; return !!t && (t.t === "num" || t.t === "var" || t.t === ")" || (t.t === "id" && !WORD_OPS.has(t.v))); };
  for (let i = 0; i < s.length;) {
    const c = s[i], rest = s.slice(i);
    if (c === " " || c === "\t") { i++; continue; }
    let m;
    // Desimaalipilkku vain sulkujen tai ryhmän sisällä, ei funktiokutsun argumenteissa, jotta min(1,2) pysyy kahtena arvona.
    if ((m = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(rest))) {
      let txt = m[0];
      if (!m[1] && !m[2] && !commaIsSeparator() && (m = /^\d+,\d+/.exec(rest))) txt = m[0];
      toks.push({ t: "num", v: parseFloat(txt.replace(",", ".")) }); i += txt.length; continue;
    }
    if ((m = /^\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(rest))) { toks.push({ t: "var", v: m[1] }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { toks.push({ t: "id", v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(==|!=|<=|>=|&&|\|\|)/.exec(rest))) { toks.push({ t: m[0] }); i += 2; continue; }
    if ("+-*/%^()<>!?:,;".includes(c)) {
      if (c === "(") {
        const last = toks[toks.length - 1];
        // Funktiokutsu: edellä on nimi. Poikkeus: and, or, xor ja not ovat operaattoreita, ja mod on operaattori vain, jos sen edellä on operandi.
        const call = !!last && last.t === "id" && !(WORD_OPS.has(last.v) && (last.v !== "mod" || operandBefore(toks.length - 2)));
        parens.push(call && !hasTopLevelSemicolon(i + 1) ? "call" : "group");
      }
      if (c === ")") { if (!parens.length) fail("Kaavassa on ylimääräinen sulje."); parens.pop(); }
      toks.push({ t: c === ";" ? "," : c }); i++; continue;
    }
    fail("Kaavassa on merkki, jota ei sallita: " + c);
  }
  return toks;
}

function parse(toks, vars) {
  let p = 0, nodes = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const node = (n) => { if (++nodes > MAX_NODES) fail("Kaava on liian monimutkainen."); return n; };
  const expect = (t) => { const x = next(); if (!x || x.t !== t) fail("Kaavassa on virhe: odotettiin merkkiä " + t + "."); };
  const isWord = (w) => peek() && peek().t === "id" && peek().v === w;
  const lvl = (d) => { if (d > MAX_DEPTH) fail("Kaavassa on liian monta sisäkkäistä osaa."); return d + 1; };

  function ternary(d) {
    d = lvl(d);
    const c = orx(d);
    if (peek() && peek().t === "?") { next(); const a = ternary(d); expect(":"); const b = ternary(d); return node({ t: "if", c, a, b }); }
    return c;
  }
  function orx(d) { let l = xor(d); while (isWord("or") || (peek() && peek().t === "||")) { next(); l = node({ t: "or", l, r: xor(d) }); } return l; }
  function xor(d) { let l = andx(d); while (isWord("xor")) { next(); l = node({ t: "xor", l, r: andx(d) }); } return l; }
  function andx(d) { let l = rel(d); while (isWord("and") || (peek() && peek().t === "&&")) { next(); l = node({ t: "and", l, r: rel(d) }); } return l; }
  function rel(d) {
    let l = add(d);
    while (peek() && ["==", "!=", "<", ">", "<=", ">="].includes(peek().t)) { const op = next().t; l = node({ t: "cmp", op, l, r: add(d) }); }
    return l;
  }
  function add(d) { let l = mul(d); while (peek() && (peek().t === "+" || peek().t === "-")) { const op = next().t; l = node({ t: "bin", op, l, r: mul(d) }); } return l; }
  function mul(d) {
    let l = unary(d);
    while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%" || isWord("mod"))) { const op = next(); l = node({ t: "bin", op: op.t === "id" ? "%" : op.t, l, r: unary(d) }); }
    return l;
  }
  function unary(d) {
    d = lvl(d);
    if (peek() && (peek().t === "-" || peek().t === "+")) { const op = next().t; const a = unary(d); return op === "-" ? node({ t: "neg", a }) : a; }
    if (isWord("not") || (peek() && peek().t === "!")) { next(); return node({ t: "not", a: unary(d) }); }
    return pow(d);
  }
  // Potenssi on oikealle liittyvä ja sitoo tiukemmin kuin etumerkki: -2^2 on -4, ja 2^-1 on sallittu.
  function pow(d) {
    d = lvl(d);
    const b = primary(d);
    if (peek() && peek().t === "^") { next(); return node({ t: "bin", op: "^", l: b, r: powOperand(d) }); }
    return b;
  }
  function powOperand(d) {
    d = lvl(d);
    if (peek() && (peek().t === "-" || peek().t === "+")) { const op = next().t; const a = powOperand(d); return op === "-" ? node({ t: "neg", a }) : a; }
    return pow(d);
  }
  function primary(d) {
    d = lvl(d);
    const x = next();
    if (!x) fail("Kaava päättyy kesken.");
    if (x.t === "num") return node({ t: "num", v: x.v });
    if (x.t === "(") { const e = ternary(d); expect(")"); return e; }
    if (x.t === "var") return variable(x.v);
    if (x.t === "id") {
      if (peek() && peek().t === "(") {
        const fname = FUNC_BY_LOWER[x.v.toLowerCase()], fn = fname && FUNCS[fname];
        if (!fn) fail("Tuntematon funktio: " + x.v + ". Käytettävissä: " + FUNCTION_NAMES.join(", ") + ".");
        next();
        const args = [];
        if (peek() && peek().t === ")") fail("Funktiolle " + x.v + " puuttuvat arvot.");
        for (;;) { args.push(ternary(d)); if (peek() && peek().t === ",") { next(); continue; } break; }
        expect(")");
        if (args.length < fn.n[0] || args.length > fn.n[1]) fail("Funktiolle " + fname + " annettiin väärä määrä arvoja.");
        return node(fname === "if" ? { t: "if", c: args[0], a: args[1], b: args[2] } : { t: "call", name: fname, args });
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, x.v)) return node({ t: "num", v: CONSTS[x.v] });
      if (WORD_OPS.has(x.v)) fail("Operaattori " + x.v + " on väärässä kohdassa.");
      return variable(x.v);
    }
    fail("Kaavassa on virhe kohdassa " + x.t + ".");
  }
  function variable(name) {
    const n = name.toUpperCase();
    if (!vars.includes(n)) fail("Tuntematon nimi: " + name + ". Käytettävissä: " + vars.slice(0, 12).join(", ") + (vars.length > 12 ? " ja " + (vars.length - 12) + " muuta" : "") + ".");
    return node({ t: "var", name: n });
  }
  const e = ternary(0);
  if (p < toks.length) fail("Kaavassa on ylimääräistä sisältöä.");
  return e;
}

class Missing extends Error {}
const truth = (x) => x !== 0;
function run(n, v) {
  switch (n.t) {
    case "num": return n.v;
    case "var": { const x = v[n.name]; if (x == null || !isFinite(x)) throw new Missing(n.name); return x; }
    case "neg": return -run(n.a, v);
    case "not": return truth(run(n.a, v)) ? 0 : 1;
    case "and": return truth(run(n.l, v)) && truth(run(n.r, v)) ? 1 : 0;
    case "or": return truth(run(n.l, v)) || truth(run(n.r, v)) ? 1 : 0;
    case "xor": return truth(run(n.l, v)) !== truth(run(n.r, v)) ? 1 : 0;
    case "if": return truth(run(n.c, v)) ? run(n.a, v) : run(n.b, v);
    case "cmp": {
      const a = run(n.l, v), b = run(n.r, v);
      return (n.op === "==" ? a === b : n.op === "!=" ? a !== b : n.op === "<" ? a < b : n.op === ">" ? a > b : n.op === "<=" ? a <= b : a >= b) ? 1 : 0;
    }
    case "bin": {
      const a = run(n.l, v), b = run(n.r, v);
      return n.op === "+" ? a + b : n.op === "-" ? a - b : n.op === "*" ? a * b : n.op === "/" ? a / b : n.op === "%" ? a % b : Math.pow(a, b);
    }
    default: return FUNCS[n.name].f(...n.args.map((a) => run(a, v)));
  }
}
const names = (n, set = new Set()) => {
  if (n.t === "var") set.add(n.name);
  ["a", "b", "c", "l", "r"].forEach((k) => { if (n[k] && typeof n[k] === "object") names(n[k], set); });
  (n.args || []).forEach((a) => names(a, set));
  return set;
};

// compile(kaava, { vars }): vars on sallittujen muuttujien nimet (oletus VARS). Palauttaa { ok: true, vars, run(arvot) } tai { ok: false, error }.
// run palauttaa { value, missing }: value on null, jos jokin tarvittu arvo puuttuu tai laskenta ei ole mahdollinen (esimerkiksi jako nollalla).
// Ehtolausekkeessa ja if-funktiossa lasketaan vain valittu haara, joten käyttämättömän haaran puuttuva arvo ei estä tulosta.
export function compile(src, opts) {
  try {
    const vars = ((opts && opts.vars) || VARS).map((x) => String(x).toUpperCase());
    const s = String(src == null ? "" : src).trim();
    if (!s) fail("Kaava on tyhjä.");
    if (s.length > MAX_LEN) fail("Kaava on liian pitkä (enintään " + MAX_LEN + " merkkiä).");
    const ast = parse(tokenize(s), vars);
    return {
      ok: true, vars: [...names(ast)],
      run(vals) {
        try { const x = run(ast, vals || {}); return { value: typeof x === "number" && isFinite(x) ? x : null, missing: [] }; }
        catch (e) { if (e instanceof Missing) return { value: null, missing: [e.message] }; throw e; }
      }
    };
  } catch (e) {
    if (e instanceof FormulaError) return { ok: false, error: e.message };
    throw e;
  }
}
