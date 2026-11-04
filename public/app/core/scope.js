// Jäsenen näkyvyys ja muutosoikeus, ilman näkymää. Worker käyttää tätä jokaisessa jäsenen pyynnössä,
// joten sääntö on yksi ja sama sekä lukemiselle että kirjoittamiselle.
import { ownerOf } from "./today.js";

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
    actual: (v) => typeof v === "string" && v.length <= 30,
    state: (v) => ["", "bad", "mid", "good"].includes(v)
  }
};

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
    roles.filter((r) => same(r.data.owner, person)).forEach((r) => {
      out.push(r); if (r.data.stream) streams.add(r.data.stream);
      rows.filter((m) => m.kind === "metric" && m.parent_id === r.id).forEach((m) => { out.push(m); mine.set(planId + "/" + m.id, "metric"); });
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

// Jäsenen muutokset: vain patch, vain omille riveille ja vain sallittuihin kenttiin arvoineen. Palauttaa true, jos kaikki kelpaa.
export function memberMayApply(ops, planId, mine) {
  return Array.isArray(ops) && ops.length > 0 && ops.every((o) => {
    if (!o || o.op !== "patch" || o.position !== undefined || o.parent_id !== undefined || o.kind !== undefined) return false;
    const kind = mine.get(planId + "/" + o.id), rules = kind && MEMBER_FIELDS[kind];
    if (!rules || !o.data || typeof o.data !== "object" || Array.isArray(o.data)) return false;
    const keys = Object.keys(o.data);
    return keys.length > 0 && keys.every((k) => Object.prototype.hasOwnProperty.call(rules, k) && rules[k](o.data[k]));
  });
}
