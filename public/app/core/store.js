// Tietovarasto: pitää suunnitelman rivit muistissa, päivittää näkymän heti ja tallentaa jonossa taustalla.
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, "").slice(0, 16);

async function call(path, init) {
  const r = await fetch("/api" + path, Object.assign({ credentials: "same-origin", cache: "no-store" }, init, init && init.body ? { headers: { "content-type": "application/json" } } : {}));
  let body = null;
  try { body = await r.json(); } catch (e) { /* tyhjä vastaus */ }
  if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { status: r.status, body });
  return body;
}

const POLL_MS = 20000;
const RETRY_MS = 5000;
const listeners = new Set();
let items = new Map(), queue = [], sending = false, retryTimer = null, version = 0, mutations = 0;

export const state = { plans: [], planId: null, email: "", save: "idle", error: "", loaded: false };

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { version++; listeners.forEach((fn) => fn(version)); }
const byPos = (a, b) => a.position - b.position;

export const get = (id) => items.get(id);
export const all = (kind) => [...items.values()].filter((i) => !kind || i.kind === kind).sort(byPos);
export const children = (parentId, kind) => [...items.values()].filter((i) => i.parent_id === parentId && (!kind || i.kind === kind)).sort(byPos);
export const sections = () => children(null, "section");
export const findSection = (type) => sections().find((s) => s.data.type === type);

function descendants(id) {
  const out = [];
  children(id).forEach((c) => { out.push(c); out.push(...descendants(c.id)); });
  return out;
}

// Muutokset näkyvät heti, tallennus etenee järjestyksessä. Peräkkäiset kentät samaan riviin yhdistetään.
function enqueue(ops) {
  mutations++;
  const planId = state.planId;
  ops.forEach((op) => {
    const last = queue[queue.length - 1];
    if (last && last.planId === planId && op.op === "patch" && last.op.op === "patch" && last.op.id === op.id) {
      const data = Object.assign({}, last.op.data, op.data);
      last.op = Object.assign({}, last.op, op, { data });
    } else queue.push({ planId, op });
  });
  setSave("saving");
  flush();
}

function setSave(s, error) { state.save = s; state.error = error || ""; emit(); }

async function flush() {
  if (sending || !queue.length) return;
  sending = true;
  clearTimeout(retryTimer);
  const planId = queue[0].planId, batch = [];
  while (queue.length && queue[0].planId === planId && batch.length < 500) batch.push(queue.shift());
  try {
    await call("/plans/" + encodeURIComponent(planId) + "/items", { method: "POST", body: JSON.stringify({ ops: batch.map((b) => b.op) }) });
    sending = false;
    if (queue.length) flush(); else setSave("saved");
  } catch (e) {
    sending = false;
    if (e.status >= 400 && e.status < 500 && e.status !== 403 && e.status !== 408 && e.status !== 429) {
      // Palvelin hylkäsi muutoksen: uudelleenyritys ei auta, joten palataan palvelimen tilaan.
      setSave("error", "Muutos hylättiin (" + e.message + "). Näkymä palautettiin tallennettuun tilaan.");
      await loadItems(planId);
      if (queue.length) flush();
      return;
    }
    queue = batch.concat(queue);
    setSave("error", e.status === 403 ? "Kirjautuminen on vanhentunut. Lataa sivu uudelleen." : "Tallennus epäonnistui. Yritetään uudelleen.");
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
  if (document.hidden || !state.planId || queue.length || sending) return;
  try { await loadItems(state.planId); } catch (e) { /* seuraava kierros yrittää uudelleen */ }
}

export async function openPlan(id) {
  await drain();
  state.planId = id;
  items = new Map();
  try { localStorage.setItem("bcc-plan", id); } catch (e) { /* ei pakollinen */ }
  await loadItems(id);
  state.loaded = true;
  emit();
}

export async function init() {
  const b = await call("/plans");
  state.plans = b.plans; state.email = b.email;
  let want = "";
  try { want = localStorage.getItem("bcc-plan") || ""; } catch (e) { /* ei pakollinen */ }
  const plan = b.plans.find((p) => p.id === want) || b.plans[0];
  if (plan) await openPlan(plan.id); else { state.loaded = true; emit(); }
  setInterval(refresh, POLL_MS);
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("beforeunload", (e) => { if (queue.length || sending) e.preventDefault(); });
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

export function exportPlan() {
  const plan = state.plans.find((p) => p.id === state.planId);
  return { format: "bcc-plan", version: 1, title: plan ? plan.title : "", exported_at: new Date().toISOString(), items: [...items.values()] };
}
