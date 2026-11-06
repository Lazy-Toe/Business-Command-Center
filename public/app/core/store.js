// Tietovarasto: pitää suunnitelman rivit muistissa, päivittää näkymän heti ja tallentaa jonossa taustalla.
import { cycleOps } from "./cycle.js";
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 16);

async function call(path, init) {
  // keepalive antaa pienen tallennuksen valmistua, vaikka välilehti suljetaan kesken pyynnön.
  const r = await fetch("/api" + path, Object.assign({ credentials: "same-origin", cache: "no-store" }, init, init && init.body ? { headers: { "content-type": "application/json" }, keepalive: init.body.length < 60000 } : {}));
  let body = null;
  try { body = await r.json(); } catch (e) { /* tyhjä vastaus */ }
  if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status, body });
  return body;
}

const POLL_MS = 20000;
const RETRY_MS = 5000;
const MAX_BATCH_CHARS = 800000;
const QUEUE_KEY = "bcc-queue";
const OVERVIEW_KINDS = new Set(["task", "row", "risk", "metric", "role", "stream", "section", "goal", "metricdef", "form", "formtype", "phase"]);
const listeners = new Set();
let items = new Map(), queue = [], sending = false, retryTimer = null, version = 0, mutations = 0, inflight = [];

export const state = { plans: [], planId: null, email: "", save: "idle", error: "", loaded: false, overview: null, overviewError: "", overviewActive: false, role: "admin", people: { list: [], rows: [], me: null, loaded: false, error: "" } };

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { version++; listeners.forEach((fn) => fn(version)); }
const byPos = (a, b) => a.position - b.position;

export const get = (id) => items.get(id);
export const all = (kind) => [...items.values()].filter((i) => !kind || i.kind === kind).sort(byPos);
export const children = (parentId, kind) => [...items.values()].filter((i) => i.parent_id === parentId && (!kind || i.kind === kind)).sort(byPos);
export const sections = () => children(null, "section");
export const findSection = (type) => sections().find((s) => s.data.type === type);

function descendants(id, seen = new Set([id])) {
  const out = [];
  children(id).forEach((c) => { if (seen.has(c.id)) return; seen.add(c.id); out.push(c); out.push(...descendants(c.id, seen)); });
  return out;
}

// Tallentamattomat muutokset säilyvät selaimessa, jos välilehti kaatuu tai kirjautuminen vanhenee.
function persist() {
  try {
    const pending = inflight.concat(queue);
    if (pending.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(pending)); else localStorage.removeItem(QUEUE_KEY);
  } catch (e) { /* selaimen muisti on lisäturva, ei edellytys */ }
}
function restoreQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    if (Array.isArray(saved)) queue = saved.filter((b) => b && b.planId && b.op).concat(queue);
  } catch (e) { /* vioittunut sisältö ohitetaan */ }
}
function applyLocal(map, op) {
  if (op.op === "put") { map.set(op.id, { id: op.id, kind: op.kind, parent_id: op.parent_id === undefined ? null : op.parent_id, position: op.position || 0, data: op.data || {} }); return; }
  if (op.op === "del") {
    const drop = (id) => { map.delete(id); [...map.values()].filter((x) => x.parent_id === id).forEach((x) => drop(x.id)); };
    drop(op.id);
    return;
  }
  const it = map.get(op.id); if (!it) return;
  const next = Object.assign({}, it, { data: Object.assign({}, it.data, op.data) });
  if (op.position !== undefined) next.position = op.position;
  if (op.parent_id !== undefined) next.parent_id = op.parent_id;
  map.set(op.id, next);
}

// Muutokset näkyvät heti, tallennus etenee järjestyksessä. Peräkkäiset kentät samaan riviin yhdistetään.
function enqueue(ops, planId = state.planId) {
  mutations++;
  ops.forEach((op) => {
    const last = queue[queue.length - 1];
    if (last && last.planId === planId && op.op === "patch" && last.op.op === "patch" && last.op.id === op.id) {
      const data = Object.assign({}, last.op.data, op.data);
      last.op = Object.assign({}, last.op, op, { data });
    } else queue.push({ planId, op });
  });
  persist();
  setSave("saving");
  flush();
}

function setSave(s, error) { state.save = s; state.error = error || ""; emit(); }

async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  clearTimeout(retryTimer);
  const planId = queue[0].planId, batch = [];
  let chars = 0;
  while (queue.length && queue[0].planId === planId && batch.length < 500) {
    const n = JSON.stringify(queue[0].op).length;
    if (batch.length && chars + n > MAX_BATCH_CHARS) break;
    chars += n;
    batch.push(queue.shift());
  }
  inflight = batch;
  try {
    await call("/plans/" + encodeURIComponent(planId) + "/items", { method: "POST", body: JSON.stringify({ ops: batch.map((b) => b.op) }) });
    sending = false; inflight = []; persist();
    if (queue.length) flush(); else setSave("saved");
  } catch (e) {
    sending = false; inflight = [];
    if (e.status >= 400 && e.status < 500 && e.status !== 403 && e.status !== 408 && e.status !== 429) {
      // Palvelin hylkäsi muutoksen: uudelleenyritys ei auta, joten palataan palvelimen tilaan.
      persist();
      setSave("error", "Muutos hylättiin (" + e.message + "). Näkymä palautettiin tallennettuun tilaan.");
      try { if (state.role === "member") await loadOverview(); else if (planId === state.planId) await showPlan(planId); } catch (x) { /* seuraava päivitys yrittää uudelleen */ }
      if (queue.length) flush();
      return;
    }
    queue = batch.concat(queue);
    persist();
    setSave("error", "Tallennus ei onnistu juuri nyt. Muutokset ovat tallessa tässä selaimessa. Jos kirjautuminen on vanhentunut, lataa sivu uudelleen.");
    retryTimer = setTimeout(flush, RETRY_MS);
  }
}

export function patch(id, data, extra) {
  const it = items.get(id); if (!it) return;
  items.set(id, Object.assign({}, it, extra, { data: Object.assign({}, it.data, data) }));
  enqueue([Object.assign({ op: "patch", id, data }, extra)]);
  emit();
}

export function nextPosition(parentId, kind) {
  const list = children(parentId, kind);
  return list.length ? list[list.length - 1].position + 1000 : 1000;
}

export function add(kind, parentId, data, opts) {
  const it = { id: (opts && opts.id) || uid(), kind, parent_id: parentId, position: (opts && opts.position) || nextPosition(parentId, kind), data: data || {} };
  items.set(it.id, it);
  enqueue([Object.assign({ op: "put" }, it)]);
  emit();
  return it;
}

export function addMany(list) {
  list.forEach((it) => items.set(it.id, it));
  enqueue(list.map((it) => Object.assign({ op: "put" }, it)));
  emit();
}

// Palauttaa poistetut rivit, jotta poiston voi kumota.
export function remove(id) {
  const it = items.get(id); if (!it) return [];
  const gone = [it, ...descendants(id)];
  gone.forEach((x) => items.delete(x.id));
  enqueue([{ op: "del", id }]);
  emit();
  return gone;
}

// Siirtää rivin toisen eteen samassa listassa. target null = listan loppuun.
export function moveBefore(id, target, list, extraData) {
  const rest = list.filter((x) => x.id !== id);
  const i = target ? rest.findIndex((x) => x.id === target) : rest.length;
  const prev = rest[i - 1], next = rest[i];
  // Toistuvat siirrot samaan väliin kuluttavat liukuluvun tarkkuuden: silloin koko lista numeroidaan uudelleen.
  if (prev && next && next.position - prev.position < 1e-6) {
    const ordered = rest.slice(0, i).concat(items.get(id), rest.slice(i));
    const ops = ordered.map((x, n) => {
      const data = x.id === id ? extraData || {} : {}, position = (n + 1) * 1000;
      items.set(x.id, Object.assign({}, items.get(x.id), { position, data: Object.assign({}, items.get(x.id).data, data) }));
      return { op: "patch", id: x.id, position, data };
    });
    enqueue(ops);
    emit();
    return;
  }
  const pos = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1000 : next ? next.position - 1000 : 1000;
  const it = items.get(id);
  items.set(id, Object.assign({}, it, { position: pos, data: Object.assign({}, it.data, extraData) }));
  enqueue([{ op: "patch", id, position: pos, data: extraData || {} }]);
  emit();
}

export function shift(id, list, dir) {
  const i = list.findIndex((x) => x.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  moveBefore(id, dir < 0 ? list[j].id : (list[j + 1] ? list[j + 1].id : null), list);
}

async function loadItems(planId) {
  const seen = mutations;
  const b = await call("/plans/" + encodeURIComponent(planId) + "/items");
  if (planId !== state.planId) return;
  // Haun aikana tehdyt muutokset ovat uudempia kuin vastaus: vastaus jätetään käyttämättä.
  if (queue.length || sending || seen !== mutations) return;
  const next = new Map(b.items.map((i) => [i.id, i]));
  items = next;
  emit();
}

async function refresh() {
  if (document.hidden || queue.length || sending) return;
  try {
    if (state.overviewActive) await loadOverview();
    else if (state.planId) await loadItems(state.planId);
  } catch (e) { /* seuraava kierros yrittää uudelleen */ }
}

// Henkilölista ja kirjautuneen käyttäjän oma henkilö. Virhe ei estä muuta käyttöä.
export async function loadPeople() {
  try {
    const b = await call("/people");
    state.people = { list: b.people.map((p) => p.name), rows: b.people, me: b.me.person, loaded: true, error: "" };
  } catch (e) {
    state.people = Object.assign({}, state.people, { error: "Henkilölistaa ei saatu ladattua (" + e.message + ")." });
  }
  emit();
}
export async function addPerson(name) { const b = await call("/people", { method: "POST", body: JSON.stringify({ name }) }); await loadPeople(); return b.name; }
export async function linkMe(name) { const b = await call("/me", { method: "PUT", body: JSON.stringify({ name }) }); await loadPeople(); return b.name; }
export async function unlinkMe() { await call("/me", { method: "DELETE" }); await loadPeople(); }

// Henkilöiden hallinta (ylläpitäjä). Nimen muutos päivittää vastuut palvelimella, joten tiedot ladataan sen jälkeen uudelleen.
async function reloadAll() {
  await loadPeople();
  // Sekä avoimen suunnitelman rivit että koonti, koska nimi on voinut muuttua kummassakin.
  try { if (state.planId) await loadItems(state.planId); if (state.overviewActive) await loadOverview(); } catch (e) { /* seuraava kierros yrittää uudelleen */ }
}
export async function renamePerson(from, to) { await call("/people/rename", { method: "POST", body: JSON.stringify({ from, to }) }); await reloadAll(); }
export async function deletePerson(name) { await call("/people/delete", { method: "POST", body: JSON.stringify({ name }) }); await loadPeople(); }
export async function setPersonEmail(name, email) { await call("/people/email", { method: "POST", body: JSON.stringify({ name, email }) }); await loadPeople(); }

// Kooste kaikista suunnitelmista. Odottavat muutokset lisätään palvelimen tilan päälle.
export async function loadOverview() {
  const seen = mutations;
  try {
    const b = await call(state.role === "member" ? "/mine" : "/overview");
    if (seen !== mutations) return;
    const byPlan = new Map();
    b.items.forEach((i) => { if (!byPlan.has(i.plan_id)) byPlan.set(i.plan_id, new Map()); byPlan.get(i.plan_id).set(i.id, i); });
    inflight.concat(queue).forEach((x) => { const m = byPlan.get(x.planId); if (m && (x.op.op !== "put" || OVERVIEW_KINDS.has(x.op.kind))) applyLocal(m, x.op); });
    const out = [];
    byPlan.forEach((m, planId) => m.forEach((i) => out.push(Object.assign({}, i, { plan_id: planId }))));
    state.plans = b.plans;
    state.overview = { items: out };
    state.overviewError = "";
    emit();
  } catch (e) {
    state.overviewError = "Koosteen päivitys epäonnistui (" + e.message + ").";
    emit();
  }
}

// Muutos mihin tahansa suunnitelmaan koostenäkymästä.
export function patchIn(planId, id, data) {
  if (state.overview) state.overview.items = state.overview.items.map((i) => (i.plan_id === planId && i.id === id ? Object.assign({}, i, { data: Object.assign({}, i.data, data) }) : i));
  const it = planId === state.planId ? items.get(id) : null;
  if (it) items.set(id, Object.assign({}, it, { data: Object.assign({}, it.data, data) }));
  enqueue([{ op: "patch", id, data }], planId);
  emit();
}

// Uusi tehtävä mihin tahansa suunnitelmaan koostenäkymästä (parentId on suunnitelman osio).
export function addIn(planId, parentId, data) {
  const it = { id: uid(), kind: "task", parent_id: parentId, position: Date.now(), data };
  if (state.overview) state.overview.items = state.overview.items.concat([Object.assign({ plan_id: planId }, it)]);
  if (planId === state.planId) items.set(it.id, it);
  enqueue([Object.assign({ op: "put" }, it)], planId);
  emit();
  return it;
}

// Useita tehtäviä kerralla ([{ planId, id, data }]): koostenäkymä ja avoin suunnitelma päivitetään kerran, ja muutokset jonotetaan suunnitelmittain.
export function patchManyIn(list) {
  if (!list.length) return;
  const upd = new Map(list.map((p) => [p.planId + "/" + p.id, p.data])), byPlan = new Map();
  if (state.overview) state.overview.items = state.overview.items.map((i) => { const d = upd.get(i.plan_id + "/" + i.id); return d ? Object.assign({}, i, { data: Object.assign({}, i.data, d) }) : i; });
  list.forEach(({ planId, id, data }) => {
    if (planId === state.planId) { const it = items.get(id); if (it) items.set(id, Object.assign({}, it, { data: Object.assign({}, it.data, data) })); }
    if (!byPlan.has(planId)) byPlan.set(planId, []);
    byPlan.get(planId).push({ op: "patch", id, data });
  });
  byPlan.forEach((ops, planId) => enqueue(ops, planId));
  emit();
}

// Lomakkeet: palvelin kirjaa tekijän, päivän ja tilan. Luonnin ja päätöksen jälkeen tiedot ladataan uudelleen.
async function refreshAfterForm(planId) {
  try {
    if (state.role === "member") await loadOverview();
    else { if (planId === state.planId) await loadItems(planId); if (state.overview) await loadOverview(); }
  } catch (e) { /* seuraava kierros yrittää uudelleen */ }
}
export async function createForm(planId, payload) {
  const b = await call("/plans/" + encodeURIComponent(planId) + "/forms", { method: "POST", body: JSON.stringify(payload) });
  await refreshAfterForm(planId);
  return b.id;
}
// Tavoiterivin kenttä koostenäkymästä. Tallentamaton (virtuaalinen) rivi luodaan ensimmäisellä kirjauksella ilman paikkaa ja vain kentillä def ja annettu arvo,
// jotta jäsenkin saa sen luoda. Tallennettu rivi päivitetään tavallisesti.
export function setRowIn(planId, row, data) {
  if (!row.virtual) { patchIn(planId, row.id, data); return; }
  const next = { plan_id: planId, id: row.id, kind: "metric", parent_id: row.parent_id, position: 0, data: Object.assign({}, row.data, data) };
  if (state.overview) state.overview.items = state.overview.items.concat(next);
  if (planId === state.planId) items.set(row.id, { id: row.id, kind: "metric", parent_id: row.parent_id, position: 0, data: next.data });
  enqueue([{ op: "put", id: row.id, kind: "metric", parent_id: row.parent_id, data: next.data }], planId);
  emit();
}

// Näkymä vaihtuu vasta, kun tiedot on saatu. Odottavat muutokset lisätään palvelimen tilan päälle.
async function showPlan(id) {
  const b = await call("/plans/" + encodeURIComponent(id) + "/items");
  const next = new Map(b.items.map((i) => [i.id, i]));
  inflight.concat(queue).filter((x) => x.planId === id).forEach((x) => applyLocal(next, x.op));
  state.planId = id;
  items = next;
  state.loaded = true;
  emit();
}

export async function openPlan(id) {
  await showPlan(id);
  try { localStorage.setItem("bcc-plan", id); } catch (e) { /* ei pakollinen */ }
}

// Kesken oleva kenttä tallennetaan, kun välilehti piilotetaan tai suljetaan.
function commitFocused() {
  const n = document.activeElement;
  if (n && (n.isContentEditable || n.tagName === "INPUT" || n.tagName === "TEXTAREA")) n.blur();
}

export async function init() {
  restoreQueue();
  document.addEventListener("visibilitychange", () => { if (document.hidden) commitFocused(); });
  window.addEventListener("pagehide", commitFocused);
  // Jäsen ei saa suunnitelmalistaa: palvelin kertoo roolin, ja jäsenelle ladataan vain oma koonti (Oma työpöytä).
  let who = null;
  try { who = await call("/people"); } catch (e) { /* ylläpitäjä toimii ilman henkilölistaa */ }
  if (who && who.role === "member") {
    state.role = "member"; state.email = who.me.email;
    state.people = { list: [], rows: [], me: who.me.person, loaded: true, error: "" };
    state.loaded = true; emit();
    if (queue.length) { setSave("saving"); flush(); }
    setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("beforeunload", (e) => { commitFocused(); if (queue.length || sending) e.preventDefault(); });
    return;
  }
  const b = await call("/plans");
  state.plans = b.plans; state.email = b.email;
  let want = "";
  try { want = localStorage.getItem("bcc-plan") || ""; } catch (e) { /* ei pakollinen */ }
  const plan = b.plans.find((p) => p.id === want) || b.plans[0];
  if (plan) await openPlan(plan.id); else { state.loaded = true; emit(); }
  if (queue.length) { setSave("saving"); flush(); }
  loadPeople();
  setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("beforeunload", (e) => { commitFocused(); if (queue.length || sending) e.preventDefault(); });
}

async function reloadPlans() { state.plans = (await call("/plans")).plans; emit(); }

function drain() { return drainWait(); }
async function drainWait() { while (queue.length || sending) await new Promise((r) => setTimeout(r, 50)); }

export async function createPlan(title, list) {
  const id = uid();
  await call("/plans", { method: "POST", body: JSON.stringify({ id, title }) });
  await reloadPlans();
  await openPlan(id);
  if (list && list.length) addMany(list);
  return id;
}

export async function duplicatePlan(title) {
  await drain();
  const id = uid();
  await call("/plans", { method: "POST", body: JSON.stringify({ id, title, from: state.planId }) });
  await reloadPlans();
  await openPlan(id);
}

// Uusi jakso: nykyinen suunnitelma kopioidaan uudeksi, ja valitut osat nollataan (ks. core/cycle.js). Vanha suunnitelma jää ennalleen.
export async function newCycle(title, opts) {
  await duplicatePlan(title);
  cycleOps(all(), opts).forEach((o) => (o.op === "remove" ? remove(o.id) : patch(o.id, o.data)));
}

export async function renamePlan(title) {
  await call("/plans/" + encodeURIComponent(state.planId), { method: "PATCH", body: JSON.stringify({ title }) });
  await reloadPlans();
}

export async function deletePlan() {
  await drain();
  await call("/plans/" + encodeURIComponent(state.planId), { method: "DELETE" });
  await reloadPlans();
  const p = state.plans[0];
  if (p) await openPlan(p.id); else { state.planId = null; items = new Map(); emit(); }
}

// Palvelimelle ehtineet muutokset ja poistot, uusin ensin. Haetaan vain pyydettäessä.
export async function loadHistory() {
  return (await call("/plans/" + encodeURIComponent(state.planId) + "/history")).history;
}

export function exportPlan() {
  const plan = state.plans.find((p) => p.id === state.planId);
  return { format: "bcc-plan", version: 1, title: plan ? plan.title : "", exported_at: new Date().toISOString(), items: [...items.values()] };
}
