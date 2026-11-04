// Euromoduulin logiikka ilman näkymää: henkilön kentät, laskentasäännöt ja tulos euroina.
// Euro-tiedot ovat arkaluontoisia: ne tallennetaan vain palvelimelle ylläpitäjän rajapintaan eivätkä päädy jäsenen tai koostenäkymien tietoihin.
import { compile } from "./formula.js";
import { toNumber } from "./scorecard.js";
import { scoreForm } from "./forms.js";

export const KEY_RE = /^[A-Z][A-Z0-9_]{0,40}$/;
export const RESERVED = ["SCORE"];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const LIMIT = 50;

const text = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

// Henkilön kenttien määrittelyt: avain (ISOT_KIRJAIMET_JA_ALAVIIVA), otsikko ja yksikkö.
export function cleanFields(list) {
  if (!Array.isArray(list)) return { error: "Kentät puuttuvat." };
  if (list.length > LIMIT) return { error: "Liian monta kenttää." };
  const seen = new Set(), fields = [];
  for (const f of list) {
    if (!f || typeof f !== "object") return { error: "Virheellinen kenttä." };
    const key = typeof f.key === "string" ? f.key.trim().toUpperCase() : "";
    if (!KEY_RE.test(key)) return { error: "Kentän tunniste on virheellinen: käytä isoja kirjaimia, numeroita ja alaviivaa." };
    if (RESERVED.includes(key)) return { error: "Tunniste " + key + " on varattu." };
    if (seen.has(key)) return { error: "Tunniste " + key + " on kahdesti." };
    seen.add(key);
    const label = text(f.label, 60);
    if (!label) return { error: "Kentällä " + key + " ei ole otsikkoa." };
    fields.push({ key, label, unit: text(f.unit, 12) });
  }
  return { fields };
}

export const varsOf = (fields) => RESERVED.concat(fields.map((f) => f.key));

// Laskentasäännöt. Kaavan pitää kääntyä, ja siinä saa käyttää vain SCORE-muuttujaa ja määriteltyjä kenttiä.
export function cleanRules(list, fields) {
  if (!Array.isArray(list)) return { error: "Säännöt puuttuvat." };
  if (list.length > LIMIT) return { error: "Liian monta sääntöä." };
  const vars = varsOf(fields), seen = new Set(), rules = [];
  for (const r of list) {
    if (!r || typeof r !== "object") return { error: "Virheellinen sääntö." };
    const id = typeof r.id === "string" && ID_RE.test(r.id) ? r.id : "";
    if (!id) return { error: "Säännön tunniste puuttuu." };
    if (seen.has(id)) return { error: "Säännön tunniste on kahdesti." };
    seen.add(id);
    const name = text(r.name, 80);
    if (!name) return { error: "Säännöllä ei ole nimeä." };
    const formula = typeof r.formula === "string" ? r.formula.trim() : "";
    const c = compile(formula, { vars });
    if (!c.ok) return { error: "Säännön \"" + name + "\" kaava: " + c.error };
    rules.push({ id, name, formula, active: r.active !== false, unit: text(r.unit, 12) || "EUR" });
  }
  return { rules };
}

// Henkilön euro-tiedot: valittu sääntö ja kenttien arvot. Arvon pitää olla tyhjä tai luku.
export function cleanPerson(pay, fields, rules) {
  if (!pay || typeof pay !== "object" || Array.isArray(pay)) return { error: "Virheelliset tiedot." };
  const rule = pay.rule === undefined || pay.rule === null ? "" : pay.rule;
  if (typeof rule !== "string" || (rule && !rules.some((r) => r.id === rule))) return { error: "Sääntöä ei löytynyt." };
  const values = {}, keys = new Set(fields.map((f) => f.key)), src = pay.values && typeof pay.values === "object" && !Array.isArray(pay.values) ? pay.values : {};
  for (const k of Object.keys(src)) {
    if (!keys.has(k)) return { error: "Tuntematon kenttä: " + k + "." };
    const v = src[k] === null || src[k] === undefined ? "" : String(src[k]).trim();
    if (v.length > 30 || (v !== "" && toNumber(v) === null)) return { error: "Kentän " + k + " arvo ei ole luku." };
    if (v !== "") values[k] = v;
  }
  return { pay: { rule, values } };
}

// Säännön tulos euroina. values on kenttien arvot tekstinä, score on SCORE:n arvo tai null.
export function payResult(rule, fields, values, score) {
  if (!rule) return { value: null, missing: [], error: "" };
  const vars = varsOf(fields), c = compile(rule.formula, { vars });
  if (!c.ok) return { value: null, missing: [], error: c.error };
  const v = { SCORE: score };
  fields.forEach((f) => { v[f.key] = toNumber((values || {})[f.key]); });
  const r = c.run(v);
  return { value: r.value, missing: r.missing, error: "" };
}

// SCORE: henkilön roolien viimeisimmän pisteytyslomakkeen lopputulos. Pisteytystyypit on merkitty tyyppiin (data.score).
// Useammalla roolilla SCORE on lopputulosten keskiarvo, ja rooli ilman pisteytystä ei vaikuta siihen.
export function scoreOfPerson(person, roles, forms, types) {
  const same = (a) => !!a && String(a).trim().toLowerCase() === String(person).trim().toLowerCase();
  const scoring = new Set(types.filter((t) => t.data.score).map((t) => t.id)), parts = [];
  roles.filter((r) => same(r.data.owner)).forEach((r) => {
    const latest = forms
      .filter((f) => f.parent_id === r.id && f.plan_id === r.plan_id && scoring.has(f.data.type))
      .sort((a, b) => String(b.data.at || "").localeCompare(String(a.data.at || "")))[0];
    if (!latest) return;
    const t = scoreForm(latest.data.rows).total;
    if (t.count > 0) parts.push({ role: r, form: latest, value: t.weighted });
  });
  return { score: parts.length ? parts.reduce((a, x) => a + x.value, 0) / parts.length : null, parts };
}

// Raha suomalaisittain: 3 000,00 EUR.
export function fmtMoney(x, unit = "EUR") {
  if (x == null || !isFinite(x)) return "–";
  return x.toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ") + (unit ? " " + unit : "");
}
