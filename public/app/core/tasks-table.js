// Tehtävätaulukon logiikka ilman näkymää: rivien kokoaminen kaikista suunnitelmista, suodatus ja massamuutos.
// Vastuu on tehtävän oma (owner) tai, jos sitä ei ole, sen vastuualueen omistaja, jonka työvirta on sama (kuten Tänään-näkymässä).
import { ownerOf } from "./today.js";

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
      const owner = String(t.data.owner || "").trim(), via = owner ? null : roles.find((r) => r.data.stream && r.data.stream === t.data.stream);
      rows.push({
        key: planId + "/" + t.id, plan_id: planId, id: t.id, parent_id: t.parent_id || null, title: String(t.data.title || ""), planTitle: title,
        stream: t.data.stream || "", streamLabel: streams.get(t.data.stream) || "", phase: t.data.phase || "", phaseLabel: phases.get(t.data.phase) || "",
        status: STATUSES.includes(t.data.status) ? t.data.status : "todo", due: ISO.test(t.data.due || "") ? t.data.due : "",
        owner, effective: ownerOf({ data: { owner, stream: t.data.stream } }, roles), inherited: ownerOf({ data: { stream: t.data.stream } }, roles),
        via: via ? via.data.title || "" : (roles.find((r) => r.data.stream && r.data.stream === t.data.stream) || { data: {} }).data.title || ""
      });
    });
  });
  return rows;
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
// f: { q, plan, stream, phase, owner, status, due }. owner "__none" = ei vastuuhenkilöä lainkaan. due "none" = ei päivää, "late" = myöhässä (today annettava).
export function filterRows(rows, f = {}, today = "") {
  const q = String(f.q || "").trim().toLowerCase();
  return rows.filter((r) =>
    (!q || r.title.toLowerCase().includes(q)) && (!f.plan || r.plan_id === f.plan) && (!f.stream || r.stream === f.stream) && (!f.phase || r.phase === f.phase) &&
    (!f.status || r.status === f.status) &&
    (!f.owner || (f.owner === "__none" ? !r.effective : same(r.effective, f.owner))) &&
    (!f.due || (f.due === "none" ? !r.due : f.due === "late" ? !!r.due && !!today && r.due < today && r.status !== "done" : true)));
}

// change: { owner?, due?, status? }. Määrittelemätön kenttä jää ennalleen. owner "" palauttaa vastuun vastuualueen mukaiseksi, due "" tyhjentää päivän.
// Palauttaa { patches: [{ planId, id, data }] } vain riveille, joilla arvo muuttuu, tai { error }.
export function bulkPatches(rows, change) {
  const c = change || {};
  if (c.owner !== undefined && (typeof c.owner !== "string" || c.owner.trim().length > 60)) return { error: "Virheellinen vastuuhenkilö." };
  if (c.due !== undefined && (typeof c.due !== "string" || (c.due !== "" && !ISO.test(c.due)))) return { error: "Virheellinen määräpäivä." };
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
