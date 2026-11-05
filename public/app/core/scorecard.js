// Scorecardin laskenta ja tavoitteiden jako ilman näkymää.
// Katalogi: yhteinen tavoite (kind goal) -> mittarimalli (kind metricdef). Roolin rivit (kind metric) viittaavat malliin kentällä def.
// Malli kuuluu työvirtaan, ja saman työvirran vastuualueille tavoite tulee automaattisesti, vaikka riviä ei ole vielä tallennettu.
import { compile, DEFAULT_FORMULA } from "./formula.js";

export const LOCKABLE = ["target", "min", "max", "weight", "start", "end"];

// Lukuarvo vapaasta tekstistä: välilyönnit ja prosenttimerkki ohitetaan, pilkku käy desimaalierottimena. Muu teksti ei ole luku.
export function toNumber(v) {
  if (v == null) return null;
  const s = String(v).replace(/\s/g, "").replace("%", "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export const virtualId = (roleId, defId) => "v-" + roleId + "-" + defId;

// Lukittu kenttä tulee aina mallilta. Lukitsematon kenttä voi saada rivillä oman arvon, muuten käytetään mallin arvoa.
export function valuesOf(def, row) {
  const d = def.data || {}, r = (row && row.data) || {}, lock = d.lock || {};
  const pick = (k) => (lock[k] || r[k] === undefined || r[k] === "" ? d[k] : r[k]);
  const out = { actual: r.actual };
  LOCKABLE.forEach((k) => { out[k] = pick(k); });
  return out;
}

// Tulos kaavasta ja painotettu tulos (tulos kertaa paino prosentteina). Alle rajan: toteuma on pienempi kuin alaraja.
export function scoreRow(def, row) {
  const v = valuesOf(def, row), c = compile((def.data && def.data.formula) || DEFAULT_FORMULA);
  const actual = toNumber(v.actual), min = toNumber(v.min), weight = toNumber(v.weight);
  const base = Object.assign({}, v, { below: actual != null && min != null && actual < min });
  if (!c.ok) return Object.assign(base, { result: null, weighted: null, error: c.error });
  const result = c.run({ TARGET: toNumber(v.target), RANGE_MIN: min, RANGE_MAX: toNumber(v.max), ACTUAL: actual }).value;
  return Object.assign(base, { result, weighted: result != null && weight != null ? result * weight / 100 : null, error: "" });
}

// Mallit järjestyksessä: yhteiset tavoitteet paikan mukaan, niiden alla mallit paikan mukaan. Tavoitteeton malli tulee viimeisenä.
export function orderDefs(goals, defs) {
  const pos = (a, b) => (a.position || 0) - (b.position || 0);
  const gs = goals.slice().sort(pos), known = new Set(gs.map((g) => g.id));
  return gs.flatMap((g) => defs.filter((d) => d.parent_id === g.id).sort(pos)).concat(defs.filter((d) => !known.has(d.parent_id)).sort(pos));
}

// Malli tulee roolille automaattisesti, jos sillä on sama työvirta tai malli on annettu suoraan roolille (def.data.roles on roolien tunnisteet).
// Vastuualueella voi olla useita työvirtoja (streams). Vanhoilla riveillä on vain yksi (stream).
export const roleStreams = (role) => {
  const d = (role && role.data) || {};
  return Array.isArray(d.streams) ? d.streams.filter(Boolean) : d.stream ? [d.stream] : [];
};
export const hasStream = (role, stream) => !!stream && roleStreams(role).includes(stream);
// Tallennettava muutos: stream pitää ensimmäisen työvirran, jotta vanhat rivit ja viennit toimivat.
export const streamsPatch = (list) => ({ streams: list, stream: list[0] || "" });
const byStream = (def, role) => hasStream(role, def.data.stream);
const byRole = (def, role) => Array.isArray(def.data.roles) && def.data.roles.includes(role.id);
export const assignedTo = (def, role) => byStream(def, role) || byRole(def, role);

// Kenelle malli tulee: roolit ja syy (stream = työvirran kautta, role = annettu suoraan, manual = lisätty käsin roolin sivulta). Piilotettu malli ei tule.
export function recipientsOf(def, roles, metricRows) {
  return roles.map((role) => {
    if ((role.data.hide || []).includes(def.id)) return null;
    if (byStream(def, role)) return { role, via: "stream" };
    if (byRole(def, role)) return { role, via: "role" };
    return (metricRows || []).some((m) => m.data.def === def.id && m.parent_id === role.id) ? { role, via: "manual" } : null;
  }).filter(Boolean);
}

// Roolin tavoiterivit: kaikki mallit, jotka tulevat roolille automaattisesti, sekä erikseen lisätyt (rivi viittaa malliin).
// Piilotettu malli (role.data.hide) ei näy kummassakaan tapauksessa. Tallentamaton rivi on virtuaalinen, ja sen tunniste on kiinteä.
export function rowsFor(role, defs, rows) {
  const hide = new Set(role.data.hide || []), stored = new Map();
  rows.filter((r) => r.data.def).forEach((r) => { if (!stored.has(r.data.def)) stored.set(r.data.def, r); });
  const out = [];
  defs.forEach((def) => {
    if (hide.has(def.id)) return;
    const auto = assignedTo(def, role), row = stored.get(def.id);
    if (!auto && !row) return;
    const real = row || { id: virtualId(role.id, def.id), kind: "metric", plan_id: role.plan_id, parent_id: role.id, position: 0, data: { def: def.id }, virtual: true };
    out.push({ def, row: real, virtual: !row, auto, score: scoreRow(def, real) });
  });
  return out;
}

// Roolin omat vapaat mittarit, joilla ei ole mallia.
export const freeRows = (rows) => rows.filter((r) => !r.data.def);

// Lopputulos on rivien painotettujen tulosten summa, ei muuta. Rivi ilman tulosta ei lisää mitään. Painot on kaikkien rivien painojen summa,
// jotta näkee, jos se ei ole 100 %. count on niiden rivien määrä, joilla on tulos.
export function totals(list) {
  const done = list.filter((x) => x.score.weighted != null);
  return { weight: list.reduce((a, x) => a + (toNumber(x.score.weight) || 0), 0), weighted: done.reduce((a, x) => a + x.score.weighted, 0), count: done.length };
}

const pad = (n) => String(n).padStart(2, "0");
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// Valmis jakso vuodelle: year, h1, h2, q1 to q4 tai kuukausi m1 to m12. Palauttaa { start, end } muodossa VVVV-KK-PP tai null.
export function periodPreset(kind, year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return null;
  const span = (a, b) => ({ start: y + "-" + pad(a) + "-01", end: y + "-" + pad(b) + "-" + pad(lastDay(y, b)) });
  const k = String(kind).toLowerCase();
  if (k === "year") return span(1, 12);
  if (k === "h1") return span(1, 6);
  if (k === "h2") return span(7, 12);
  let m = /^q([1-4])$/.exec(k);
  if (m) return span((m[1] - 1) * 3 + 1, m[1] * 3);
  m = /^m(1[0-2]|[1-9])$/.exec(k);
  return m ? span(Number(m[1]), Number(m[1])) : null;
}
export const PERIODS = [["year", "Vuosi"], ["h1", "H1"], ["h2", "H2"], ["q1", "Q1"], ["q2", "Q2"], ["q3", "Q3"], ["q4", "Q4"]];

// Jakson teksti, esimerkiksi 1.1.2026–31.3.2026. Tyhjä, jos päiviä ei ole.
export function periodText(start, end) {
  const f = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Number(m[3]) + "." + Number(m[2]) + "." + m[1] : ""; };
  return f(start) && f(end) ? f(start) + "–" + f(end) : f(start) || f(end);
}
