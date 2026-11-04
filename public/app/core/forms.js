// Tallennetut lomakkeet ilman näkymää. Lomake on jäädytetty kuva roolin scorecardista: tyyppi, kommentti, tekijä, päivä ja
// taulukon syöttöarvot kaavan kopioineen. Tuloksia ei tallenneta vaan ne lasketaan näytettäessä, joten tulosta ei voi väärentää.
// Tyypit ovat dataa (kind formtype), eikä koodissa ole yhtään kiinteää tyyppiä.
import { valuesOf, scoreRow, totals } from "./scorecard.js";
import { DEFAULT_FORMULA } from "./formula.js";

export const ROW_FIELDS = ["target", "min", "max", "weight", "actual"];
export const APPLY_FIELDS = ["target", "min", "max", "weight"];
const MAX_ROWS = 60, MAX_COMMENT = 4000, MAX_VAL = 30;
export const STATUSES = ["open", "accepted", "rejected", "applied"];
export const STATUS_TEXT = { open: "Avoin", accepted: "Hyväksytty", rejected: "Hylätty", applied: "Otettu käyttöön" };

const byPos = (a, b) => (a.position || 0) - (b.position || 0);
export const sortTypes = (types) => types.slice().sort(byPos);

// Ylläpitäjä saa luoda kaikkia tyyppejä, jäsen vain niitä, jotka on merkitty jäsenelle sallituiksi.
export const canCreate = (type, isAdmin) => !!type && (!!isAdmin || !!type.data.memberCreate);
export const typesFor = (types, isAdmin) => sortTypes(types).filter((t) => canCreate(t, isAdmin));

// Lomakkeen päivä muodossa 20.4.2020.
export function dateFi(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? Number(m[3]) + "." + Number(m[2]) + "." + m[1] : "";
}
export const formLabel = (f) => ((f.data.typeName || "Lomake") + " " + dateFi(f.data.at)).trim();

// Roolin lomakkeet uusimmasta vanhimpaan. Jäsen näkee vain tyypit, jotka on merkitty hänelle näkyviksi, sekä omat lomakkeensa.
export function visibleForms(role, forms, types, viewer) {
  const typeOf = (id) => types.find((t) => t.id === id);
  return forms
    .filter((f) => f.parent_id === role.id)
    .filter((f) => viewer.admin || (typeOf(f.data.type) && typeOf(f.data.type).data.memberView) || (!!viewer.person && f.data.byPerson === viewer.person))
    .sort((a, b) => String(b.data.at || "").localeCompare(String(a.data.at || "")) || (b.position || 0) - (a.position || 0));
}

// Luonnoksen rivit: kopio roolin tavoiteriveistä (rowsFor:n tulos).
export function draftRows(effective) {
  return effective.map((x) => ({ def: x.def.id, target: str(x.score.target), min: str(x.score.min), max: str(x.score.max), weight: str(x.score.weight), actual: str(x.row.data.actual) }));
}
const str = (v) => (v == null ? "" : String(v));

// Syöttöarvot jäädytetyiksi riveiksi. Rivin pitää kuulua roolin tavoitteisiin, lukittu kenttä tulee mallilta, ja nimi sekä kaava
// otetaan mallista eikä käyttäjältä. Palauttaa { rows } tai { error }.
export function freezeRows(input, effective) {
  if (!Array.isArray(input)) return { error: "Taulukon rivit puuttuvat." };
  if (input.length > MAX_ROWS) return { error: "Liian monta riviä." };
  const byDef = new Map(effective.map((x) => [x.def.id, x])), seen = new Set(), rows = [];
  for (const r of input) {
    if (!r || typeof r !== "object" || typeof r.def !== "string") return { error: "Virheellinen rivi." };
    const x = byDef.get(r.def);
    if (!x) return { error: "Rivi ei kuulu roolin tavoitteisiin." };
    if (seen.has(r.def)) return { error: "Sama tavoite kahdesti." };
    seen.add(r.def);
    const data = {};
    for (const k of ROW_FIELDS) {
      if (r[k] === undefined || r[k] === null || r[k] === "") continue;
      if (typeof r[k] !== "string" && typeof r[k] !== "number") return { error: "Virheellinen arvo." };
      const s = String(r[k]).trim();
      if (s.length > MAX_VAL) return { error: "Arvo on liian pitkä." };
      data[k] = s;
    }
    const v = valuesOf(x.def, { data });
    rows.push({ def: x.def.id, name: x.def.data.name || "", formula: x.def.data.formula || DEFAULT_FORMULA, start: str(v.start), end: str(v.end), target: str(v.target), min: str(v.min), max: str(v.max), weight: str(v.weight), actual: str(v.actual) });
  }
  return { rows };
}

// Jäädytetyn rivin tulos kaavan kopiosta. Rivin arvot ovat kiinteitä, joten kaikki kentät luetaan sellaisenaan.
export function scoreSnapshot(row) {
  const lock = { target: true, min: true, max: true, weight: true, start: true, end: true };
  const def = { data: { formula: row.formula, lock, target: row.target, min: row.min, max: row.max, weight: row.weight, start: row.start, end: row.end } };
  return scoreRow(def, { data: { actual: row.actual } });
}
export function scoreForm(rows) {
  const list = (rows || []).map((r) => Object.assign({}, r, { score: scoreSnapshot(r) }));
  return { rows: list, total: totals(list) };
}

// Luontipyynnön tarkistus palvelimelle ja käyttöliittymälle. effective on roolin rowsFor-lista, types tyyppirivit.
export function checkForm(p, { types, isAdmin, effective }) {
  if (!p || typeof p !== "object") return { error: "Virheellinen pyyntö." };
  const type = types.find((t) => t.id === p.type);
  if (!type || !canCreate(type, isAdmin)) return { error: "Tyyppi ei ole sallittu." };
  if (p.comment !== undefined && typeof p.comment !== "string") return { error: "Virheellinen kommentti." };
  const comment = (p.comment || "").slice(0, MAX_COMMENT);
  let rows = [];
  if (type.data.table) {
    const f = freezeRows(p.rows === undefined ? [] : p.rows, effective);
    if (f.error) return f;
    rows = f.rows;
  } else if (Array.isArray(p.rows) && p.rows.length) return { error: "Tyypillä ei ole taulukkoa." };
  return { ok: true, type, comment, rows };
}

// Ehdotuksen käyttöönotto: lomakkeen tavoite, rajat ja paino roolin riveille. Toteumaa ei oteta käyttöön, ja lukitut kentät jäävät mallille.
// Tallentamaton rivi luodaan put-muutoksella, tallennettu päivitetään patch-muutoksella.
export function applyOps(form, role, effective) {
  const byDef = new Map(effective.map((x) => [x.def.id, x]));
  const ops = [];
  (form.data.rows || []).forEach((r) => {
    const x = byDef.get(r.def);
    if (!x) return;
    const lock = x.def.data.lock || {}, data = {};
    APPLY_FIELDS.forEach((k) => { if (!lock[k]) data[k] = r[k] || ""; });
    if (!Object.keys(data).length) return;
    ops.push(x.virtual ? { op: "put", id: x.row.id, kind: "metric", parent_id: role.id, data: Object.assign({ def: r.def }, data) } : { op: "patch", id: x.row.id, data });
  });
  return ops;
}

// Päätöksen sallitut siirtymät. Käyttöönotto onnistuu avoimesta tai hyväksytystä.
export function nextStatus(from, to) {
  if (!STATUSES.includes(to) || to === "open") return false;
  if (to === "applied") return from === "open" || from === "accepted";
  return from === "open" || from === "accepted" || from === "rejected";
}

