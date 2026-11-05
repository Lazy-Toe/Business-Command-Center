// Jäsenen näkyvyys ja muutosoikeus, ilman näkymää. Worker käyttää tätä jokaisessa jäsenen pyynnössä,
// joten sääntö on yksi ja sama sekä lukemiselle että kirjoittamiselle.
import { ownerOf } from "./today.js";
import { rowsFor, roleStreams } from "./scorecard.js";
import { visibleForms } from "./forms.js";

const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Kentät, joita jäsen saa muuttaa omilla riveillään, ja niiden tarkistus. Kaikki muu on ylläpitäjän.
export const MEMBER_FIELDS = {
  task: {
    status: (v) => ["todo", "doing", "done"].includes(v),
    due: (v) => v === "" || ISO.test(v),
    note: (v) => typeof v === "string" && v.length <= 2000
  },
  metric: {
    actual: (v) => typeof v === "string" && v.length <= 30
  }
};
const ACTUAL_OK = MEMBER_FIELDS.metric.actual;

// items: rivejä ({ plan_id, id, kind, parent_id, position, data }) yhdestä tai useammasta suunnitelmasta.
// Palauttaa vain henkilön omat rivit: tehtävät (oma tai työvirran kautta peritty vastuu), vastuualueet ja niiden mittarit
// sekä näiden työvirrat nimiöitä varten. Perityn vastuun nimi kirjoitetaan tehtävään, jotta asiakas ei tarvitse muiden rivejä.
export function scopeFor(items, person) {
  const out = [], mine = new Map();
  if (!person) return { items: out, mine };
  const plans = [...new Set(items.map((i) => i.plan_id))];
  plans.forEach((planId) => {
    const rows = items.filter((i) => i.plan_id === planId);
    const roles = rows.filter((i) => i.kind === "role");
    const streams = new Set();
    const defs = rows.filter((d) => d.kind === "metricdef");
    const types = rows.filter((t) => t.kind === "formtype"), allForms = rows.filter((f) => f.kind === "form");
    let typesShown = false;
    roles.filter((r) => same(r.data.owner, person)).forEach((r) => {
      out.push(r); roleStreams(r).forEach((x) => streams.add(x));
      // Lomaketyypit nimineen ja valintoineen sekä ne roolin lomakkeet, jotka jäsen saa nähdä. Lomakkeita jäsen ei voi muuttaa.
      if (!typesShown) { typesShown = true; types.forEach((t) => out.push(t)); }
      visibleForms(r, allForms, types, { admin: false, person }).forEach((f) => out.push(f));
      const own = rows.filter((m) => m.kind === "metric" && m.parent_id === r.id), seen = new Set();
      // Vapaat mittarit ilman mallia.
      own.filter((m) => !m.data.def).forEach((m) => { out.push(m); mine.set(planId + "/" + m.id, "metric"); });
      // Mallipohjaiset rivit: malli näkyy vain luettavana, tallennettua riviä saa muuttaa ja tallentamattomalle saa kirjata ensimmäisen toteuman.
      rowsFor(r, defs, own).forEach((x) => {
        if (!seen.has(x.def.id)) { seen.add(x.def.id); out.push(x.def); }
        if (x.virtual) mine.set(planId + "/" + x.row.id, { kind: "vmetric", role: r.id, def: x.def.id });
        else { out.push(x.row); mine.set(planId + "/" + x.row.id, "metric"); }
      });
    });
    rows.filter((t) => t.kind === "task" && same(ownerOf(t, roles), person)).forEach((t) => {
      out.push(Object.assign({}, t, { data: Object.assign({}, t.data, { owner: person }) }));
      mine.set(planId + "/" + t.id, "task");
      if (t.data.stream) streams.add(t.data.stream);
    });
    rows.filter((s) => s.kind === "stream" && streams.has(s.id)).forEach((s) => out.push(s));
  });
  return { items: out, mine };
}

// Jäsenen muutokset. Sallittu on vain:
// 1) patch omalle riville ja sallittuihin kenttiin arvoineen, tai
// 2) tallentamattoman tavoiterivin ensimmäinen luonti (put) täsmälleen sovitulla tunnisteella ja vain kentillä def ja actual.
// Yksikin sääntöjen ulkopuolinen muutos hylkää koko pyynnön. Palauttaa true, jos kaikki kelpaa.
export function memberMayApply(ops, planId, mine) {
  return Array.isArray(ops) && ops.length > 0 && ops.every((o) => {
    if (!o || typeof o !== "object") return false;
    const entry = mine.get(planId + "/" + o.id), kind = typeof entry === "string" ? entry : entry && entry.kind;
    if (o.op === "put") {
      if (kind !== "vmetric" || o.kind !== "metric" || o.parent_id !== entry.role || o.position !== undefined) return false;
      const keys = o.data && typeof o.data === "object" && !Array.isArray(o.data) ? Object.keys(o.data) : [];
      return keys.length > 0 && keys.every((k) => k === "def" || k === "actual") && o.data.def === entry.def && (o.data.actual === undefined || ACTUAL_OK(o.data.actual));
    }
    if (o.op !== "patch" || o.position !== undefined || o.parent_id !== undefined || o.kind !== undefined) return false;
    const rules = kind && MEMBER_FIELDS[kind];
    if (!rules || !o.data || typeof o.data !== "object" || Array.isArray(o.data)) return false;
    const keys = Object.keys(o.data);
    return keys.length > 0 && keys.every((k) => Object.prototype.hasOwnProperty.call(rules, k) && rules[k](o.data[k]));
  });
}
