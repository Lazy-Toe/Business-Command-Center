// Tehtävät: kaikki tehtävät kaikista suunnitelmista yhdessä taulukossa. Suodatus, rivin muokkaus ja massamuutos (vastuu, määräpäivä, tila).
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { ui, uiChanged, DueInput } from "../core/ui.js";
import { state, loadOverview, patchManyIn } from "../core/store.js";
import { taskRows, filterRows, bulkPatches, invertPatches, suggestPatches, ownersIn, groupRows, periodOptions, GROUPS, STATUS_LABEL } from "../core/tasks-table.js";
import { todayISO, isSaneDue } from "../core/today.js";
import { peopleNames, PersonSelect } from "../people.js";
import { Multi } from "../multi.js";

const EMPTY = { q: "", plan: "", stream: [], phase: [], owner: [], status: [], due: "" };
const COLS = [["stream", "Työvirta"], ["phase", "Vaihe"], ["owner", "Vastuu"], ["due", "Määräpäivä"], ["status", "Tila"]];
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ei pakollinen */ } };

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
  const periodOf = (v) => [...periods.months, ...periods.quarters].find((p) => p.value === v);
  const PeriodOpts = () => html`<optgroup label="Kuukausi">${periods.months.map((p) => html`<option key=${p.value} value=${p.value}>${p.label}</option>`)}</optgroup>
    <optgroup label="Neljännes">${periods.quarters.map((p) => html`<option key=${"q" + p.value} value=${p.value}>${p.label}</option>`)}</optgroup>`;
  const PeriodPick = ({ label, onPick, cls, text }) => html`<select class=${"periodsel " + (cls || "")} aria-label=${label} title=${label} value="" onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v) onPick(v, periodOf(v)); }}><option value="">${text}</option>${PeriodOpts()}</select>`;
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

    <div class="bulkbar" role="region" aria-label="Massamuutos">
      <b>${chosen.length ? chosen.length + " valittu" : "Valitse rivit vasemmalta"}</b>
      <select aria-label="Vaihda vastuu" disabled=${!chosen.length} value="" onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v === SUGGEST) applyPatches(suggestPatches(chosen).patches, chosen, "vastuualueen omistaja"); else if (v === "__clear") apply({ owner: "" }, "vastuuhenkilö poistettu"); else if (v) apply({ owner: v }, "vastuu " + v); }}><option value="">Vastuu…</option>${names.map((n) => html`<option key=${n} value=${n}>${n}</option>`)}<option value=${SUGGEST}>Vastuualueen omistaja (työvirran mukaan)</option><option value="__clear">Poista vastuuhenkilö</option></select>
      <select aria-label="Vaihda määräpäivä" disabled=${!chosen.length} value="" onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v === "__clear") apply({ due: "" }, "päivä tyhjennetty"); else if (v) apply({ due: v }, "määräpäivä " + (periodOf(v) || { label: v }).label); }}><option value="">Määräpäivä…</option><option value="__clear">Tyhjennä päivä</option>${PeriodOpts()}</select>
      <${BulkDate} disabled=${!chosen.length} onApply=${(v) => apply({ due: v }, "määräpäivä")} />
      <select aria-label="Vaihda tila" disabled=${!chosen.length} value="" onChange=${(e) => { const v = e.target.value; e.target.value = ""; if (v) apply({ status: v }, "tila " + STATUS_LABEL[v]); }}><option value="">Tila…</option>${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select>
      <span class="grow"></span>
      ${chosen.length ? html`<button type="button" class="linkbtn" onClick=${() => { setSel(new Set()); setMsg(""); }}>Tyhjennä valinta</button>` : null}
    </div>
    ${unowned.length ? html`<p class="gs unownedbar" role="status">${unowned.length} näkyvällä tehtävällä ei ole vastuuhenkilöä, eikä niitä näytetä kenenkään työpöydällä.${fillable ? html` <button type="button" class="barbtn" onClick=${() => applyPatches(suggestPatches(unowned).patches, unowned, "vastuualueen omistaja")}>Kirjaa vastuualueen omistaja (${fillable})</button>` : null}</p>` : null}
    ${msg ? html`<p class=${"gs" + (/virhe|Ei muutosta/i.test(msg) ? " bad" : "")} role="status">${msg}</p>` : null}

    ${shown.length ? html`<div class="gtable-wrap"><table class="gtable sctable taskstable">
      <thead><tr><th class="ckcol"><input type="checkbox" aria-label="Valitse kaikki näkyvät" checked=${allOn} onChange=${() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.key)))} /></th>
        <th>Tehtävä</th>${COLS.map(([k, l]) => (col(k) ? html`<th key=${k}>${l}</th>` : null))}</tr></thead>
      ${groups.map((g) => html`<tbody key=${"g" + g.key}>${by ? html`<tr class="grouprow"><td class="ckcol"><input type="checkbox" aria-label=${"Valitse ryhmä: " + g.label} checked=${g.rows.every((r) => sel.has(r.key))} onChange=${() => pick(g)} /></td><th colspan=${1 + COLS.filter(([k]) => col(k)).length} scope="colgroup"><span class="grouphead">${g.label} <span class="gs">${g.rows.length} tehtävää${g.rows.filter((r) => r.status === "done").length ? ", " + g.rows.filter((r) => r.status === "done").length + " valmista" : ""}</span>${col("due") ? html`${PeriodPick({ cls: "grp", text: "Aseta ryhmän määräpäivä…", label: "Aseta määräpäivä ryhmälle: " + g.label, onPick: (v, p) => apply({ due: v }, "määräpäivä " + (p ? p.label : v), g.rows) })}` : null}</span></th></tr>` : null}${g.rows.map((r) => { const i = shown.indexOf(r); return html`<tr key=${r.key} class=${sel.has(r.key) ? "picked" : ""}>
        <td class="ckcol"><input type="checkbox" aria-label=${"Valitse: " + (r.title || "tehtävä")} checked=${sel.has(r.key)} onClick=${(e) => toggle(r, i, e)} onChange=${() => {}} /></td>
        <td class="nmtd"><button type="button" class="ttitle" title="Avaa suunnitelmassa" onClick=${() => open(r.plan_id, { id: r.id, kind: "task", parent_id: r.parent_id })}>${r.title || "Nimetön tehtävä"}</button>${state.plans.length > 1 ? html`<span class="tsub">${r.planTitle}</span>` : null}</td>
        ${col("stream") ? html`<td class="gs">${r.streamLabel || "–"}</td>` : null}${col("phase") ? html`<td class="gs">${r.phaseLabel || "–"}</td>` : null}
        ${col("owner") ? html`<td><${PersonSelect} cls=${"personsel" + (!r.owner ? " none" : "")} label=${"Vastuu: " + (r.title || "")} value=${r.owner} empty="Ei vastuuhenkilöä" onPick=${(v) => one(r, { owner: v })} /></td>` : null}
        ${col("due") ? html`<td><${DueInput} aria-label=${"Määräpäivä: " + (r.title || "")} value=${r.due} onSave=${(v) => one(r, { due: v })} />${PeriodPick({ text: "Jakso…", label: "Aseta jakson loppu: " + (r.title || ""), onPick: (v) => one(r, { due: v }) })}</td>` : null}
        ${col("status") ? html`<td><select aria-label=${"Tila: " + (r.title || "")} value=${r.status} onChange=${(e) => one(r, { status: e.target.value })}>${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option key=${k} value=${k}>${l}</option>`)}</select></td>` : null}
      </tr>`; })}</tbody>`)}</table></div>` : html`<p class="tclear">Ei tehtäviä näillä suodattimilla.</p>`}
  </div>`;
}
