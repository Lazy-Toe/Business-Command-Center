// Tehtävät: kaikki tehtävät kaikista suunnitelmista yhdessä taulukossa. Suodatus, rivin muokkaus ja massamuutos (vastuu, määräpäivä, tila).
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui } from "../core/ui.js";
import { state, loadOverview, addIn } from "../core/store.js";
import { QuickAdd } from "../quickadd.js";
import { taskRows, filterRows, ownersIn, groupRows, GROUPS, STATUS_LABEL } from "../core/tasks-table.js";
import { todayISO, suggestedOwner } from "../core/today.js";
import { Multi } from "../multi.js";
import { TaskTable, COLS } from "../tasktable.js";

const EMPTY = { q: "", plan: "", stream: [], phase: [], owner: [], status: [], due: "" };
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ei pakollinen */ } };

export function TasksView({ open }) {
  const [f, setF] = useState(() => { const x = ui.taskFilter || {}; ui.taskFilter = null; const m = Object.assign({}, EMPTY, x); ["stream", "phase", "owner", "status"].forEach((k) => { m[k] = Array.isArray(m[k]) ? m[k] : m[k] ? [m[k]] : []; }); return m; });
  const [hidden, setHidden] = useState(() => new Set(lsGet("bcc-task-cols", "").split(",").filter(Boolean)));
  const col = (k) => !hidden.has(k);
  const toggleCol = (k) => setHidden((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); lsSet("bcc-task-cols", [...n].join(",")); return n; });
  const [by, setBy] = useState(() => lsGet("bcc-task-group", ""));
  // Avoin valikko sulkeutuu, kun klikataan muualle.
  useEffect(() => { const h = (e) => document.querySelectorAll("details.multi[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); }); document.addEventListener("click", h); return () => document.removeEventListener("click", h); }, []);
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const ov = state.overview;
  if (!ov) return html`<div class="wrap today"><p class="gs ${state.overviewError ? "bad" : ""}">${state.overviewError || "Ladataan…"}</p></div>`;

  const all = taskRows(ov.items, state.plans), found = filterRows(all, f, todayISO());
  const groups = groupRows(found, by), shown = groups.flatMap((g) => g.rows), today = todayISO();
  const groupBy = (v) => { setBy(v); lsSet("bcc-task-group", v); };
  const inPlan = f.plan ? all.filter((r) => r.plan_id === f.plan) : all;
  const streams = [...new Map(inPlan.filter((r) => r.stream).map((r) => [r.stream, r.streamLabel || r.stream])).entries()];
  const phases = [...new Map(inPlan.filter((r) => r.phase).map((r) => [r.phase, r.phaseLabel || r.phase])).entries()];
  // Uusi tehtävä: suodatetun suunnitelman (tai avoimen) osioon, valittuun vaiheeseen ja työvirtaan tai ensimmäiseen. Tarkennus tehdään taulukon valikoilla.
  const addTask = (title) => {
    const planId = f.plan || state.planId || (state.plans[0] && state.plans[0].id), rows = ov.items.filter((i) => i.plan_id === planId);
    const section = rows.find((i) => i.kind === "section" && i.data.type === "plan"); if (!section) return;
    const byPos = (a, b) => (a.position || 0) - (b.position || 0), phs = rows.filter((i) => i.kind === "phase").sort(byPos), sts = rows.filter((i) => i.kind === "stream").sort(byPos);
    const phase = f.phase.length === 1 && phs.some((p) => p.id === f.phase[0]) ? f.phase[0] : (phs[0] ? phs[0].id : "");
    const stream = f.stream.length === 1 && sts.some((w) => w.id === f.stream[0]) ? f.stream[0] : (sts[0] ? sts[0].id : "");
    addIn(planId, section.id, { title, detail: "", phase, stream, status: "todo", note: "", owner: suggestedOwner(stream, rows.filter((i) => i.kind === "role")) });
  };
  const set = (k, v) => setF((o) => Object.assign({}, o, { [k]: v }));
  const dirty = Object.keys(EMPTY).some((k) => (Array.isArray(f[k]) ? f[k].length : f[k]));

  return html`<div class="wrap today taskspage">
    <header class="thead"><div><p class="eyebrow">Tehtävät</p><h1>Kaikki tehtävät</h1><p class="lede">${shown.length} / ${all.length} tehtävää</p></div>
      <p class="gs">Muokkaa tehtäviä suoraan riviltä tai valitse useita ja muuta vastuu, aloitus, lopetus tai tila kerralla. Tehtävä kuuluu henkilölle vain valitun vastuuhenkilön kautta: työvirta ei siirrä sitä kenellekään.</p></header>

    <div class="tfilters taskfilters">
      <input type="search" class="tsearch" placeholder="Hae tehtävää…" aria-label="Hae tehtävää" value=${f.q} onInput=${(e) => set("q", e.target.value)} />
      ${state.plans.length > 1 ? html`<label class="gyear">Suunnitelma <select value=${f.plan} onChange=${(e) => { set("plan", e.target.value); set("stream", []); set("phase", []); }}><option value="">Kaikki</option>${state.plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}</select></label>` : null}
      <${Multi} label="Työvirta" value=${f.stream} options=${streams} onChange=${(v) => set("stream", v)} />
      <${Multi} label="Vaihe" value=${f.phase} options=${phases} onChange=${(v) => set("phase", v)} />
      <${Multi} label="Vastuu" value=${f.owner} options=${[["__none", "Ei vastuuhenkilöä"]].concat(ownersIn(all).map((o) => [o, o]))} onChange=${(v) => set("owner", v)} />
      <${Multi} label="Tila" value=${f.status} options=${Object.entries(STATUS_LABEL)} onChange=${(v) => set("status", v)} />
      <label class="gyear">Päivä <select value=${f.due} onChange=${(e) => set("due", e.target.value)}><option value="">Kaikki</option><option value="late">Myöhässä</option><option value="none">Ei määräpäivää</option></select></label>
      <label class="gyear">Ryhmittele <select value=${by} onChange=${(e) => groupBy(e.target.value)}><option value="">Ei ryhmittelyä</option>${Object.entries(GROUPS).filter(([k]) => k !== "plan" || state.plans.length > 1).map(([k, g]) => html`<option key=${k} value=${k}>${g.label}</option>`)}</select></label>
      <details class="multi colmenu"><summary aria-label="Raportin sarakkeet">⋯ Sarakkeet</summary><div class="multibox">${COLS.map(([k, l]) => html`<label key=${k}><input type="checkbox" checked=${col(k)} onChange=${() => toggleCol(k)} /> ${l}</label>`)}</div></details>
      ${dirty ? html`<button type="button" class="linkbtn" onClick=${() => setF(Object.assign({}, EMPTY))}>Tyhjennä suodattimet</button>` : null}
    </div>

    ${state.role === "member" ? null : html`<div class="tadd"><${QuickAdd} label="Uusi tehtävä" onAdd=${addTask} placeholder="Tehtävän nimi, Enter lisää" /><span class="gs">Tehtävä tulee ${f.plan ? "valittuun" : "avoimeen"} suunnitelmaan valittuun vaiheeseen ja työvirtaan (ellei valittu, ensimmäiseen). Tarkenna rivin valikoilla.</span></div>`}

    <${TaskTable} groups=${groups} by=${by} allRows=${all} items=${ov.items} cols=${COLS.filter(([k]) => col(k))} open=${open} today=${today}
      hint='Klikkaa arvoa muuttaaksesi yhden tehtävän. Sarakkeen "Kaikille" muuttaa kaikki näkyvät tehtävät (rajaa ensin suodattimilla) tai valitut rivit.' emptyText="Ei tehtäviä näillä suodattimilla." />
  </div>`;
}
