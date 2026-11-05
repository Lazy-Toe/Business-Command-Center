// Tehtävätaulukon logiikka ilman näkymää: rivien kokoaminen kaikista suunnitelmista, suodatus ja massamuutos.
// Vastuu on tehtävän oma (owner) tai, jos sitä ei ole, sen vastuualueen omistaja, jonka työvirta on sama (kuten Tänään-näkymässä).
import { suggestedOwner, isSaneDue } from "./today.js";
import { hasStream } from "./streams.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const STATUS_LABEL = { todo: "Ei aloitettu", doing: "Käynnissä", done: "Valmis" };
const STATUSES = Object.keys(STATUS_LABEL);

// items: rivejä kaikista suunnitelmista ({ plan_id, id, kind, parent_id, data }). plans: [{ id, title }] suunnitelmien järjestyksessä.
export function taskRows(items, plans) {
  const rows = [], planIds = plans.map((p) => p.id);
  const order = planIds.concat([...new Set(items.map((i) => i.plan_id))].filter((id) => !planIds.includes(id)));
  order.forEach((planId) => {
    const mine = items.filter((i) => i.plan_id === planId), title = (plans.find((p) => p.id === planId) || {}).title || "";
    const roles = mine.filter((i) => i.kind === "role"), label = (kind, f) => new Map(mine.filter((i) => i.kind === kind).map((i) => [i.id, i.data[f] || ""]));
    const streams = label("stream", "label"), phases = label("phase", "title");
    mine.filter((i) => i.kind === "task").forEach((t) => {
      const owner = String(t.data.owner || "").trim(), via = roles.find((r) => hasStream(r, t.data.stream));
      rows.push({
        key: planId + "/" + t.id, plan_id: planId, id: t.id, parent_id: t.parent_id || null, title: String(t.data.title || ""), planTitle: title,
        stream: t.data.stream || "", streamLabel: streams.get(t.data.stream) || "", phase: t.data.phase || "", phaseLabel: phases.get(t.data.phase) || "",
        status: STATUSES.includes(t.data.status) ? t.data.status : "todo", due: ISO.test(t.data.due || "") ? t.data.due : "",
        owner, effective: owner, suggested: suggestedOwner(t.data.stream, roles),
        via: via ? via.data.title || "" : ""
      });
    });
  });
  return rows;
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
// f: { q, plan, stream, phase, owner, status, due }. owner "__none" = ei vastuuhenkilöä lainkaan. due "none" = ei päivää, "late" = myöhässä (today annettava).
export function filterRows(rows, f = {}, today = "") {
  const q = String(f.q || "").trim().toLowerCase();
  // Suodatin on yksi arvo tai lista arvoja (tyhjä lista tai tyhjä arvo = kaikki). Lista sallii useamman vaiheen, vastuun jne. yhtä aikaa.
  const want = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const any = (v, test) => { const w = want(v); return !w.length || w.some(test); };
  return rows.filter((r) =>
    (!q || r.title.toLowerCase().includes(q)) && any(f.plan, (v) => r.plan_id === v) && any(f.stream, (v) => r.stream === v) && any(f.phase, (v) => r.phase === v) &&
    any(f.status, (v) => r.status === v) &&
    any(f.owner, (v) => (v === "__none" ? !r.effective : same(r.effective, v))) &&
    any(f.due, (v) => (v === "none" ? !r.due : v === "late" ? !!r.due && !!today && r.due < today && r.status !== "done" : true)));
}

// change: { owner?, due?, status? }. Määrittelemätön kenttä jää ennalleen. owner "" palauttaa vastuun vastuualueen mukaiseksi, due "" tyhjentää päivän.
// Palauttaa { patches: [{ planId, id, data }] } vain riveille, joilla arvo muuttuu, tai { error }.
export function bulkPatches(rows, change) {
  const c = change || {};
  if (c.owner !== undefined && (typeof c.owner !== "string" || c.owner.trim().length > 60)) return { error: "Virheellinen vastuuhenkilö." };
  if (c.due !== undefined && (typeof c.due !== "string" || (c.due !== "" && !isSaneDue(c.due)))) return { error: "Virheellinen määräpäivä." };
  if (c.status !== undefined && !STATUSES.includes(c.status)) return { error: "Virheellinen tila." };
  const want = {};
  if (c.owner !== undefined) want.owner = c.owner.replace(/\s+/g, " ").trim();
  if (c.due !== undefined) want.due = c.due;
  if (c.status !== undefined) want.status = c.status;
  if (!Object.keys(want).length) return { error: "Ei muutosta." };
  const patches = [];
  rows.forEach((r) => {
    const data = {};
    Object.keys(want).forEach((k) => { if (r[k] !== want[k]) data[k] = want[k]; });
    if (Object.keys(data).length) patches.push({ planId: r.plan_id, id: r.id, data });
  });
  return { patches };
}

// Vastuuhenkilön kirjaus tehtäville, joilla sitä ei ole: ehdotus (saman työvirran vastuualueen omistaja) tallennetaan tehtävälle itselleen.
// Palauttaa { patches } vain riveille, joille ehdotus on olemassa.
export function suggestPatches(rows) {
  return { patches: rows.filter((r) => !r.owner && r.suggested).map((r) => ({ planId: r.plan_id, id: r.id, data: { owner: r.suggested } })) };
}

// Muutosten peruutus: samat kentät riveiltä, sellaisina kuin ne olivat ennen muutosta.
export function invertPatches(rows, patches) {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return patches.map((p) => {
    const r = byKey.get(p.planId + "/" + p.id), data = {};
    Object.keys(p.data).forEach((k) => { data[k] = r ? r[k] : ""; });
    return { planId: p.planId, id: p.id, data };
  });
}

// Vastuuhenkilöt, jotka esiintyvät riveillä, suodatinvalikkoa varten.
export const ownersIn = (rows) => [...new Set(rows.map((r) => r.effective).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fi"));

const MONTHS = ["tammikuu", "helmikuu", "maaliskuu", "huhtikuu", "toukokuu", "kesäkuu", "heinäkuu", "elokuu", "syyskuu", "lokakuu", "marraskuu", "joulukuu"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n) => String(n).padStart(2, "0");
// Kuukauden viimeinen päivä (kuukausi 1–12).
export const lastDay = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const endISO = (year, month) => year + "-" + pad(month) + "-" + pad(lastDay(year, month));
const fi = (iso) => { const [y, m, d] = iso.split("-"); return Number(d) + "." + Number(m) + "."; };

// Ryhmittelytavat. Jokainen palauttaa ryhmän avaimen ja otsikon, tyhjä avain tarkoittaa "ei arvoa" (ryhmä menee viimeiseksi).
export const GROUPS = {
  stream: { label: "Työvirta", of: (r) => ({ key: r.stream, label: r.streamLabel || r.stream, none: "Ei työvirtaa" }) },
  phase: { label: "Vaihe", of: (r) => ({ key: r.phase, label: r.phaseLabel || r.phase, none: "Ei vaihetta" }) },
  owner: { label: "Vastuu", of: (r) => ({ key: r.effective, label: r.effective, none: "Ei vastuuhenkilöä" }) },
  status: { label: "Tila", of: (r) => ({ key: r.status, label: STATUS_LABEL[r.status], none: "" }) },
  month: { label: "Määräpäivän kuukausi", of: (r) => ({ key: r.due.slice(0, 7), label: r.due ? cap(MONTHS[Number(r.due.slice(5, 7)) - 1]) + " " + r.due.slice(0, 4) : "", none: "Ei määräpäivää" }) },
  quarter: { label: "Määräpäivän neljännes", of: (r) => { const q = r.due ? Math.ceil(Number(r.due.slice(5, 7)) / 3) : 0; return { key: r.due ? r.due.slice(0, 4) + "-" + q : "", label: r.due ? "Q" + q + " " + r.due.slice(0, 4) : "", none: "Ei määräpäivää" }; } },
  plan: { label: "Suunnitelma", of: (r) => ({ key: r.plan_id, label: r.planTitle, none: "" }) }
};

// Jakaa rivit ryhmiin. Ilman ryhmittelyä yksi nimetön ryhmä. Järjestys: tila ja aika luonnollisesti, vastuu aakkosin, muut ensiesiintymän mukaan; tyhjä arvo viimeisenä.
export function groupRows(rows, by) {
  const g = GROUPS[by];
  if (!g) return [{ key: "", label: "", rows: rows.slice() }];
  const map = new Map();
  rows.forEach((r) => {
    const x = g.of(r), key = x.key || "";
    if (!map.has(key)) map.set(key, { key, label: key ? x.label || key : x.none, rows: [] });
    map.get(key).rows.push(r);
  });
  const out = [...map.values()];
  const rank = (k) => (by === "status" ? STATUSES.indexOf(k) : 0);
  const sorted = by === "owner" ? (a, b) => a.label.localeCompare(b.label, "fi") : by === "month" || by === "quarter" ? (a, b) => a.key.localeCompare(b.key) : by === "status" ? (a, b) => rank(a.key) - rank(b.key) : () => 0;
  out.sort((a, b) => (!a.key) - (!b.key) || sorted(a, b));
  return out;
}

// Valittavat jaksot määräpäivän asettamiseen: arvo on jakson viimeinen päivä. Kuukaudet edellisestä 14 kuukautta eteenpäin, neljännekset kuluvasta kuusi eteenpäin.
export function periodOptions(today) {
  const m = /^(\d{4})-(\d{2})/.exec(today || "");
  if (!m) return { months: [], quarters: [] };
  const y0 = Number(m[1]), m0 = Number(m[2]), months = [], quarters = [];
  for (let i = -1; i < 14; i++) {
    const t = y0 * 12 + (m0 - 1) + i, y = Math.floor(t / 12), mo = (t % 12) + 1, iso = endISO(y, mo);
    months.push({ value: iso, label: mo + "/" + String(y).slice(2) + " (" + fi(iso) + ")" });
  }
  const q0 = Math.floor((m0 - 1) / 3);
  for (let i = 0; i < 6; i++) {
    const t = y0 * 4 + q0 + i, y = Math.floor(t / 4), q = (t % 4) + 1, iso = endISO(y, q * 3);
    quarters.push({ value: iso, label: "Q" + q + " " + String(y).slice(2) + " (" + fi(iso) + ")" });
  }
  return { months, quarters };
}
