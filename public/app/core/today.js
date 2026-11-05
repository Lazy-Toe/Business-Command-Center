// Tänään-näkymän logiikka ilman näkymää. Päivät ovat muodossa VVVV-KK-PP.
import { scoreRow } from "./scorecard.js";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function fmtDate(iso) {
  if (!ISO.test(iso || "")) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return d + "." + m + "." + y;
}
const WEEKDAYS = ["sunnuntai", "maanantai", "tiistai", "keskiviikko", "torstai", "perjantai", "lauantai"];
export function fmtLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + " " + d + "." + m + "." + y;
}
// Päivän kirjoitus näppäimistöllä tuottaa välivaiheessa kelvollisia päiviä, kuten vuoden 0002. Vain järkevä vuosi tallennetaan.
export const isSaneDue = (v) => ISO.test(v || "") && +v.slice(0, 4) >= 2000 && +v.slice(0, 4) < 2100;
export const hasDue = (t) => ISO.test(t.data.due || "");
export const isLate = (t, today) => hasDue(t) && t.data.due < today && t.data.status !== "done";

// Tehtävän oma vastuuhenkilö tai saman työvirran vastuualueen omistaja.
export function ownerOf(task, roles) {
  if (task.data.owner) return task.data.owner;
  const r = (roles || []).find((x) => x.data.stream && x.data.stream === task.data.stream);
  return r && r.data.owner ? r.data.owner : "";
}

const byDue = (a, b) => (a.data.due < b.data.due ? -1 : a.data.due > b.data.due ? 1 : 0);

// items: rivejä kaikista suunnitelmista ({ plan_id, id, kind, parent_id, data }).
export function buildToday(items, today, filter = {}) {
  const inPlan = (planId, kind) => items.filter((i) => i.plan_id === planId && i.kind === kind);
  const plans = [...new Set(items.map((i) => i.plan_id))];
  const owners = new Set();
  let tasks = [];
  plans.forEach((planId) => {
    const roles = inPlan(planId, "role"), streams = inPlan(planId, "stream");
    inPlan(planId, "task").forEach((t) => {
      const owner = ownerOf(t, roles), stream = streams.find((s) => s.id === t.data.stream);
      if (t.data.status === "done") return;
      if (owner) owners.add(owner);
      tasks.push(Object.assign({}, t, { owner, stream, inherited: ownerOf({ data: { stream: t.data.stream } }, roles) }));
    });
  });

  const roleOf = (m) => items.find((i) => i.plan_id === m.plan_id && i.id === m.parent_id);
  // Huomiota vaativat: huonoksi arvioidut rivit ja riskit sekä tavoiterivit, joiden toteuma on alle mallin alarajan.
  const defOf = (m) => items.find((i) => i.kind === "metricdef" && i.plan_id === m.plan_id && i.id === m.data.def);
  let attention = items
    .filter((i) => {
      if (i.kind === "row" || i.kind === "risk") return i.data.state === "bad";
      if (i.kind !== "metric" || !i.data.def) return false;
      const def = defOf(i);
      return !!def && scoreRow(def, i).below;
    })
    .map((i) => {
      const role = i.kind === "metric" ? roleOf(i) : null;
      const owner = role ? role.data.owner || "" : "";
      if (owner) owners.add(owner);
      const def = i.kind === "metric" ? defOf(i) : null;
      return Object.assign({}, i, { owner, role, title: def ? def.data.name : i.data.name });
    });

  // Avoimet ehdotukset odottavat ylläpitäjän päätöstä.
  const typeOf = (f) => items.find((t) => t.kind === "formtype" && t.plan_id === f.plan_id && t.id === f.data.type);
  items.filter((i) => i.kind === "form" && i.data.status === "open" && typeOf(i) && typeOf(i).data.proposal).forEach((i) => {
    const role = roleOf(i), owner = role ? role.data.owner || "" : "";
    if (owner) owners.add(owner);
    attention.push(Object.assign({}, i, { owner, role, title: (i.data.typeName || "Ehdotus") + (role ? " · " + role.data.title : "") }));
  });

  if (filter.plan) {
    tasks = tasks.filter((t) => t.plan_id === filter.plan);
    attention = attention.filter((t) => t.plan_id === filter.plan);
  }
  if (filter.owner) {
    tasks = tasks.filter((t) => t.owner === filter.owner);
    attention = attention.filter((t) => t.owner === filter.owner);
  }

  const week = addDays(today, 7);
  const dated = tasks.filter(hasDue).sort(byDue);
  return {
    late: dated.filter((t) => t.data.due < today),
    today: dated.filter((t) => t.data.due === today),
    week: dated.filter((t) => t.data.due > today && t.data.due <= week),
    later: dated.filter((t) => t.data.due > week),
    doing: tasks.filter((t) => !hasDue(t) && t.data.status === "doing"),
    noDate: tasks.filter((t) => !hasDue(t) && t.data.status !== "doing"),
    attention,
    owners: [...owners].sort((a, b) => a.localeCompare(b, "fi"))
  };
}
