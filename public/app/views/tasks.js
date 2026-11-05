// Tehtävät: kaikki tehtävät kaikista suunnitelmista yhdessä taulukossa. Suodatus, rivin muokkaus ja massamuutos (vastuu, määräpäivä, tila).
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui, uiChanged } from "../core/ui.js";
import { state, loadOverview, patchManyIn } from "../core/store.js";
import { taskRows, filterRows, bulkPatches, invertPatches, suggestPatches, ownersIn, groupRows, periodOptions, GROUPS, STATUS_LABEL } from "../core/tasks-table.js";
import { todayISO, isSaneDue, fmtDue } from "../core/today.js";
import { peopleNames } from "../people.js";
import { Multi } from "../multi.js";

const EMPTY = { q: "", plan: "", stream: [], phase: [], owner: [], status: [], due: "" };
const COLS = [["stream", "Työvirta"], ["phase", "Vaihe"], ["owner", "Vastuu"], ["due", "Määräpäivä"], ["status", "Tila"]];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ei pakollinen */ } };

const closeMenu = (e) => { const d = e.currentTarget.closest("details"); if (d) d.removeAttribute("open"); };

// Yksi muutosvalikko kaikkiin paikkoihin (sarakeotsikko, ryhmän otsikko, valintapalkki). Valinta toimii yhdellä klikkauksella ja koskee aina
// valikon kertomia rivejä (scope). up: aukeaa ylös (alapalkki), muuten alas.
function FieldMenu({ field, title, rows, scope, names, periods, apply, applyPatches, up, cls, right }) {
  const run = (fn) => (e) => { fn(); closeMenu(e); };
  const go = (change, what) => run(() => apply(change, what, rows));
  const canSuggest = suggestPatches(rows).patches.length > 0;
  return html`<details class=${"fmenu " + (up ? "up " : "") + (right ? "right " : "") + (cls || "")}><summary>${title}</summary>
    <div class="fm-box"><p class="fm-scope">Koskee: <b>${scope}</b></p>
      ${field === "owner" ? html`<div class="bm-grid">${names.map((n) => html`<button type="button" key=${n} class="bm-btn" onClick=${go({ owner: n }, "vastuu " + n)}>${n}</button>`)}</div>
        ${canSuggest ? html`<button type="button" class="bm-btn wide" onClick=${run(() => applyPatches(suggestPatches(rows).patches, rows, "vastuualueen omistaja"))}>Vastuualueen omistaja (työvirran mukaan)</button>` : null}
        <button type="button" class="bm-btn wide quiet" onClick=${go({ owner: "" }, "vastuuhenkilö poistettu")}>Poista vastuuhenkilö</button>` : null}
      ${field === "due" ? html`<p class="bm-h">Viikko (päättyy sunnuntaina)</p>
        <div class="bm-grid months">${periods.weeks.slice(0, 6).map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Kuukauden loppu</p>
        <div class="bm-grid months">${periods.months.slice(1, 7).map((p) => html`<button type="button" key=${p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Neljänneksen loppu</p>
        <div class="bm-grid months">${periods.quarters.slice(0, 3).map((p) => html`<button type="button" key=${"q" + p.value} class="bm-btn" onClick=${go({ due: p.value }, "määräpäivä " + p.label)}>${p.label}</button>`)}</div>
        <p class="bm-h">Muu päivä</p>
        <${BulkDate} onApply=${(v) => apply({ due: v }, "määräpäivä", rows)} />
        <button type="button" class="bm-btn wide quiet" onClick=${go({ due: "" }, "päivä tyhjennetty")}>Tyhjennä päivä</button>` : null}
      ${field === "status" ? html`<div class="bm-grid">${Object.entries(STATUS_LABEL).map(([k, l]) => html`<button type="button" key=${k} class="bm-btn" onClick=${go({ status: k }, "tila " + l)}>${l}</button>`)}</div>` : null}
    </div></details>`;
}

// Valittujen rivien toimintopalkki: näkyy vain kun rivejä on valittu.
function BulkBar({ count, menu, clear }) {
  return html`<div class="bulkbar" role="region" aria-label="Massamuutos">
    <b class="bb-count">${count} valittu</b>
    <${FieldMenu} ...${menu("owner", "Vastuu")} up=${true} cls="bb" /><${FieldMenu} ...${menu("due", "Määräpäivä")} up=${true} cls="bb" /><${FieldMenu} ...${menu("status", "Tila")} up=${true} cls="bb" />
    <span class="grow"></span>
    <button type="button" class="bb-clear" onClick=${clear}>Poista valinta</button>
  </div>`;
}
// Massamuutoksen päivä otetaan käyttöön vasta painikkeesta, jotta kirjoitus kesken ei muuta valittuja tehtäviä.
function BulkDate({ disabled, onApply }) {
  const [v, setV] = useState("");
  const ok = isSaneDue(v);
  const go = () => { if (ok) { onApply(v); setV(""); } };
  return html`<span class="bulkgrp"><input type="date" min="2000-01-01" max="2099-12-31" aria-label="Määräpäivä valituille" disabled=${disabled} value=${v} onInput=${(e) => setV(e.target.value)} onChange=${(e) => setV(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") go(); }} />
    <button type="button" class="barbtn" disabled=${disabled || !ok} onClick=${go}>Aseta päivä</button></span>`;
}

export function TasksView({ open }) {
  const [f, setF] = useState(() => { const x = ui.taskFilter || {}; ui.taskFilter = null; const m = Object.assign({}, EMPTY, x); ["stream", "phase", "owner", "status"].forEach((k) => { m[k] = Array.isArray(m[k]) ? m[k] : m[k] ? [m[k]] : []; }); return m; });
  const [sel, setSel] = useState(() => new Set());
  const [last, setLast] = useState(-1);
  const [hidden, setHidden] = useState(() => new Set(lsGet("bcc-task-cols", "").split(",").filter(Boolean)));
  const col = (k) => !hidden.has(k);
  const toggleCol = (k) => setHidden((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); lsSet("bcc-task-cols", [...n].join(",")); return n; });
  const [by, setBy] = useState(() => lsGet("bcc-task-group", ""));
  const [msg, setMsg] = useState("");
  // Avoin valikko sulkeutuu, kun klikataan muualle.
  useEffect(() => { const h = (e) => document.querySelectorAll("details.multi[open]").forEach((d) => { if (!d.contains(e.target)) d.removeAttribute("open"); }); document.addEventListener("click", h); return () => document.removeEventListener("click", h); }, []);
  useEffect(() => { state.overviewActive = true; loadOverview(); return () => { state.overviewActive = false; }; }, []);
  const ov = state.overview;
  if (!ov) return html`<div class="wrap today"><p class="gs ${state.overviewError ? "bad" : ""}">${state.overviewError || "Ladataan…"}</p></div>`;

  const all = taskRows(ov.items, state.plans), found = filterRows(all, f, todayISO());
  const groups = groupRows(found, by), shown = groups.flatMap((g) => g.rows), today = todayISO(), periods = periodOptions(today);
  const pick = (g) => (g.rows.every((r) => sel.has(r.key)) ? setSel((o) => { const n = new Set(o); g.rows.forEach((r) => n.delete(r.key)); return n; }) : setSel((o) => { const n = new Set(o); g.rows.forEach((r) => n.add(r.key)); return n; }));
  const groupBy = (v) => { setBy(v); lsSet("bcc-task-group", v); };
  const chosen = shown.filter((r) => sel.has(r.key));
  const inPlan = f.plan ? all.filter((r) => r.plan_id === f.plan) : all;
  const streams = [...new Map(inPlan.filter((r) => r.stream).map((r) => [r.stream, r.streamLabel || r.stream])).entries()];
  const phases = [...new Map(inPlan.filter((r) => r.phase).map((r) => [r.phase, r.phaseLabel || r.phase])).entries()];
  const set = (k, v) => { setF((o) => Object.assign({}, o, { [k]: v })); setMsg(""); };
  const names = peopleNames(...ownersIn(all));

  const toggle = (r, i, e) => {
    setSel((o) => {
      const n = new Set(o);
      if (e.shiftKey && last >= 0) { const [a, b] = [Math.min(last, i), Math.max(last, i)], on = !o.has(r.key); shown.slice(a, b + 1).forEach((x) => (on ? n.add(x.key) : n.delete(x.key))); }
      else if (n.has(r.key)) n.delete(r.key); else n.add(r.key);
      return n;
    });
    setLast(i);
  };
  const allOn = shown.length > 0 && chosen.length === shown.length;
  // Massamuutos koskee vain näkyviä valittuja rivejä. Muutos on peruttavissa, ja se jonotetaan suunnitelmittain.
  const apply = (change, what, rows = chosen) => {
    const r = bulkPatches(rows, change);
    if (r.error) { setMsg(r.error); return; }
    if (!r.patches.length) { setMsg("Valitut tehtävät ovat jo tällaisia."); return; }
    const back = invertPatches(rows, r.patches);
    patchManyIn(r.patches);
    ui.undo = { label: "Muutettu " + r.patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
    uiChanged();
    setMsg(r.patches.length + " tehtävää muutettu (" + what + ").");
  };
  // Valmiit muutokset (riville ominaiset arvot) kirjataan yhtenä peruttavana eränä.
  const applyPatches = (patches, rows, what) => {
    if (!patches.length) { setMsg("Ei kirjattavia muutoksia."); return; }
    const back = invertPatches(rows, patches);
    patchManyIn(patches);
    ui.undo = { label: "Muutettu " + patches.length + " tehtävää (" + what + ")", run: () => patchManyIn(back) };
    uiChanged();
    setMsg(patches.length + " tehtävää muutettu (" + what + ").");
  };
  const unowned = shown.filter((r) => !r.owner), fillable = suggestPatches(unowned).patches.length;
  // Jaksovalinta: arvo on jakson viimeinen päivä. Yksi valinta asettaa määräpäivän riville, ryhmälle tai valituille.
  // Valikon tiedot: koskee annettuja rivejä (scope kertoo ne tekstinä).
  const menuFor = (rows, scope) => (field, title) => ({ field, title, rows, scope, names, periods, apply, applyPatches });
  // Otsikon valikko koskee valittuja rivejä tai, jos mitään ei ole valittu, kaikkia näkyviä (suodatettuja) rivejä.
  const scopeRows = chosen.length ? chosen : shown;
  const scopeText = chosen.length ? chosen.length + " valittua tehtävää" : "kaikkia " + shown.length + " näkyvää tehtävää";
  // Rivin oma valikko koskee aina vain sitä riviä. Useiden rivien muutos tehdään valintapalkista.
  const cellMenu = (r, field, text) => menuFor([r], "vain tätä tehtävää")(field, text + " ▾");
  const one = (r, data) => patchManyIn([{ planId: r.plan_id, id: r.id, data }]);
  const dirty = Object.keys(EMPTY).some((k) => (Array.isArray(f[k]) ? f[k].length : f[k]));

  return html`<div class="wrap today taskspage">
    <header class="thead"><div><p class="eyebrow">Tehtävät</p><h1>Kaikki tehtävät</h1><p class="lede">${shown.length} / ${all.length} tehtävää</p></div>
      <p class="gs">Muokkaa tehtäviä suoraan riviltä tai valitse useita ja muuta vastuu, määräpäivä tai tila kerralla. Tehtävä kuuluu henkilölle vain valitun vastuuhenkilön kautta: työvirta ei siirrä sitä kenellekään.</p></header>

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
      ${dirty ? html`<button type="button" class="linkbtn" onClick=${() => { setF(Object.assign({}, EMPTY)); setMsg(""); }}>Tyhjennä suodattimet</button>` : null}
    </div>

    ${chosen.length ? null : html`<p class="gs bulkhint">Klikkaa arvoa muuttaaksesi yhden tehtävän. Sarakkeen "Kaikille" muuttaa kaikki näkyvät tehtävät (rajaa ensin suodattimilla) tai valitut rivit.</p>`}
    ${unowned.length ? html`<p class="gs unownedbar" role="status">${unowned.length} näkyvällä tehtävällä ei ole vastuuhenkilöä, eikä niitä näytetä kenenkään työpöydällä.${fillable ? html` <button type="button" class="barbtn" onClick=${() => applyPatches(suggestPatches(unowned).patches, unowned, "vastuualueen omistaja")}>Kirjaa vastuualueen omistaja (${fillable})</button>` : null}</p>` : null}
    ${msg ? html`<p class=${"gs" + (/virhe|Ei muutosta/i.test(msg) ? " bad" : "")} role="status">${msg}</p>` : null}

    ${shown.length ? html`<div class="gtable-wrap"><table class="gtable sctable taskstable">
      <thead><tr><th class="ckcol"><input type="checkbox" aria-label="Valitse kaikki näkyvät" checked=${allOn} onChange=${() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
        <th>Tehtävä</th>${COLS.map(([k, l]) => (col(k) ? html`<th key=${k}>${l}${["owner", "due", "status"].includes(k) ? html` <${FieldMenu} ...${menuFor(scopeRows, scopeText)(k, "Kaikille ▾")} cls="hd" right=${k !== "owner"} />` : null}</th>` : null))}</tr></thead>
      ${groups.map((g) => html`<tbody key=${"g" + g.key}>${by ? html`<tr class="grouprow"><td class="ckcol"><input type="checkbox" aria-label=${"Valitse ryhmä: " + g.label} checked=${g.rows.every((r) => sel.has(r.key))} onChange=${() => pick(g)} /></td><th colspan=${1 + COLS.filter(([k]) => col(k)).length} scope="colgroup"><span class="grouphead">${g.label} <span class="gs">${g.rows.length} tehtävää${g.rows.filter((r) => r.status === "done").length ? ", " + g.rows.filter((r) => r.status === "done").length + " valmista" : ""}</span><span class="gmenus">Muuta ryhmälle: <${FieldMenu} ...${menuFor(g.rows, "ryhmän " + g.rows.length + " tehtävää")("owner", "Vastuu ▾")} cls="gr" /><${FieldMenu} ...${menuFor(g.rows, "ryhmän " + g.rows.length + " tehtävää")("due", "Määräpäivä ▾")} cls="gr" /><${FieldMenu} ...${menuFor(g.rows, "ryhmän " + g.rows.length + " tehtävää")("status", "Tila ▾")} cls="gr" /></span></span></th></tr>` : null}${g.rows.map((r) => { const i = shown.indexOf(r); return html`<tr key=${r.key} class=${sel.has(r.key) ? "picked" : ""}>
        <td class="ckcol"><input type="checkbox" aria-label=${"Valitse: " + (r.title || "tehtävä")} checked=${sel.has(r.key)} onClick=${(e) => toggle(r, i, e)} onChange=${() => {}} /></td>
        <td class="nmtd"><button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(r.plan_id, { id: r.id, kind: "task", parent_id: r.parent_id })}>${r.title || "Nimetön tehtävä"}</button>${state.plans.length > 1 ? html`<span class="tsub">${r.planTitle}</span>` : null}</td>
        ${col("stream") ? html`<td class="gs">${r.streamLabel || "–"}</td>` : null}${col("phase") ? html`<td class="gs">${r.phaseLabel || "–"}</td>` : null}
        ${col("owner") ? html`<td><${FieldMenu} ...${cellMenu(r, "owner", r.owner || "Ei vastuuhenkilöä")} cls=${"cell" + (r.owner ? "" : " none")} /></td>` : null}
        ${col("due") ? html`<td><${FieldMenu} ...${cellMenu(r, "due", r.due ? fmtDue(r.due) : "Ei päivää")} cls=${"cell" + (r.due ? "" : " none")} right=${true} /></td>` : null}
        ${col("status") ? html`<td><${FieldMenu} ...${cellMenu(r, "status", STATUS_LABEL[r.status])} cls=${"cell st-" + r.status} right=${true} /></td>` : null}
      </tr>`; })}</tbody>`)}</table></div>` : html`<p class="tclear">Ei tehtäviä näillä suodattimilla.</p>`}
    ${chosen.length ? html`<${BulkBar} count=${chosen.length} menu=${menuFor(chosen, chosen.length + " valittua tehtävää")} clear=${() => { setSel(new Set()); setMsg(""); }} />` : null}
  </div>`;
}
