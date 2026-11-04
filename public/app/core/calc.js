// Laskenta on puhdasta logiikkaa ilman näkymää, jotta sen voi testata erikseen.
export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

export function fmt(x, d) { return x == null || !isFinite(x) ? "–" : x.toFixed(d).replace(".", ","); }
export const auto = (x) => fmt(x, x % 1 ? 1 : 0);

// Syötteen siivous: palauttaa merkkijonon, tyhjän tai null, jos arvo ei kelpaa.
export function cleanNum(v) {
  v = String(v == null ? "" : v).trim().replace(",", ".").replace("%", "").trim();
  if (!v) return "";
  if (!/^[-+]?\d{1,4}(\.\d{1,3})?$/.test(v)) return null;
  return String(parseFloat(v));
}

function baseOf(line, input) {
  const r = num(line.rev);
  if (r != null) return { v: r, est: false };
  const tot = num(input.totRev), others = input.lines.filter((l) => l !== line);
  if (tot != null && others.length && others.every((l) => num(l.rev) != null)) {
    return { v: Math.max(0, tot - others.reduce((a, l) => a + num(l.rev), 0)), est: false };
  }
  const shares = input.lines.map((l) => num(l.share) || 0), sum = shares.reduce((a, b) => a + b, 0);
  const share = sum > 0 ? (num(line.share) || 0) / sum : 1 / input.lines.length;
  const whole = tot != null ? tot : num(input.estTotal) || 0;
  return { v: whole * share, est: tot == null };
}

// input: { lines: [{ id, rev, g, m, share, arr }], totRev, estTotal, baseYear, targetYear, nrr, cust, projYears }
export function calcGoals(input) {
  const baseYear = num(input.baseYear) || new Date().getFullYear();
  const y = num(input.targetYear) || baseYear + 1, n = y - baseYear;
  const out = { year: y, baseYear, lines: {}, est: false, proj: [] };
  let now = 0, tgt = 0, eb = 0, okTgt = input.lines.length > 0, okE = input.lines.length > 0;
  input.lines.forEach((l) => {
    const b = baseOf(l, input), g = num(l.g), m = num(l.m);
    const target = g != null ? b.v * Math.pow(1 + g / 100, n) : null;
    const ebitda = target != null && m != null ? target * m / 100 : null;
    out.lines[l.id] = { base: b.v, est: b.est, target, ebitda };
    if (b.est) out.est = true;
    now += b.v;
    if (target == null) okTgt = false; else tgt += target;
    if (ebitda == null) okE = false; else eb += ebitda;
  });
  out.totBase = now;
  out.totTarget = okTgt ? tgt : null;
  out.totGrowth = okTgt && now > 0 && n > 0 ? (Math.pow(tgt / now, 1 / n) - 1) * 100 : null;
  out.totEbitda = okE ? eb : null;
  out.totMargin = okE && okTgt && tgt > 0 ? eb / tgt * 100 : null;

  (input.projYears || []).forEach((yy) => {
    const k = yy - baseYear, row = { year: yy, lines: {}, tot: null, nrr: null, cust: null, est: false };
    let sum = 0, ok = input.lines.length > 0;
    input.lines.forEach((l) => {
      const b = out.lines[l.id], g = num(l.g);
      if (b.est) row.est = true;
      if (g == null) { row.lines[l.id] = null; ok = false; return; }
      row.lines[l.id] = b.base * Math.pow(1 + g / 100, k);
      sum += row.lines[l.id];
    });
    if (ok) row.tot = sum;
    const first = input.lines[0], nrr = num(input.nrr), cust = num(input.cust);
    if (first && nrr != null) row.nrr = out.lines[first.id].base * Math.pow(nrr / 100, k);
    if (cust != null) row.cust = 100 * Math.pow(1 + cust / 100, k);
    out.proj.push(row);
  });

  const first = input.lines[0];
  if (first) {
    const f = out.lines[first.id], g = num(first.g), m = num(first.m);
    out.primary = f;
    out.r40 = g != null && m != null ? { g, m, sum: g + m } : null;
  }
  // Nimetyt arvot, joihin muut moduulit voivat viitata teksteissään.
  out.values = {
    perus: first ? out.lines[first.id].base : null,
    tavoite: first ? out.lines[first.id].target : null,
    nettopito: num(input.nrr),
    yhteensa: now,
    yhteensa_tavoite: out.totTarget,
    "~": first && out.lines[first.id].est ? "≈ " : ""
  };
  return out;
}

// Teksti, jossa on lukuviittauksia: {perus:1}, {perus*0.05:2}, {nettopito:a}, {~}.
// Jos jokin arvo puuttuu, käytetään varatekstiä.
const TOKEN = /\{([~\wäö]+)(?:\*(-?\d+(?:\.\d+)?))?(?::(a|\d))?\}/g;
function fill(tpl, values) {
  let missing = false;
  const text = String(tpl || "").replace(TOKEN, (_, name, mul, dec) => {
    if (name === "~") return values["~"] || "";
    const v = values[name];
    if (v == null) { missing = true; return ""; }
    const x = v * (mul ? parseFloat(mul) : 1);
    return dec === "a" ? auto(x) : fmt(x, dec ? +dec : 1);
  });
  return missing ? null : text;
}
export function template(tpl, fallback, values) {
  const a = fill(tpl, values);
  if (a != null) return a;
  const b = fill(fallback, values);
  return b != null ? b : String(fallback || "");
}

// Valittavat henkilöt: tallennetut nimet ja vastuualueiden nykyiset vastuuhenkilöt. Sama nimi vain kerran, kirjainkoolla ei ole väliä.
export function peopleOf(...lists) {
  const seen = new Map();
  lists.flat().forEach((n) => {
    const t = String(n == null ? "" : n).replace(/\s+/g, " ").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fi"));
}
